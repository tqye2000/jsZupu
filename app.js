//----------------------------------------------------------------
// File app.js  –  Main application orchestrator
//
// Modules loaded before this file:
//   i18n.js   – translations & language detection
//   utils.js  – pure utility helpers (generateId, escapeHtml, …)
//   graph.js  – Cytoscape.js graph factory
//   svgtree.js – strict nuclear-family SVG tree builder
//
// History:
// 2025-Apr-12: Initial version
// 2026-Mar-21: Added SVG export to nuclear family tree view
// 2026-Mar-21: Split monolith into modules
//----------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {

    // --- i18n (see i18n.js) ---
    Zupu.i18n.apply(Zupu.i18n.detect());

    // --- Utility aliases (see utils.js / i18n.js) ---
    const { generateId, escapeHtml, getDisplayName } = Zupu.utils;
    const t = Zupu.i18n.t;

    // --- Globals ---
    let familyData = { people: [], families: [], events: [], places: [], sources: [], notes: [], meta: {} };
    let cy; // Cytoscape instance
    let currentlyEditingPersonId = null;
    let currentFileName = null; // Track the currently loaded file name
    let isDirty = false; // Track unsaved changes

    // --- Indexes (rebuilt after data load/mutation) ---
    let peopleById = new Map();   // pid -> person object
    let familiesById = new Map(); // fid -> family object
    let eventsByPerson = new Map(); // pid -> [event, ...]

    function rebuildIndexes() {
        peopleById = new Map(familyData.people.map(p => [p.id, p]));
        familiesById = new Map(familyData.families.map(f => [f.id, f]));
        eventsByPerson = new Map();
        for (const ev of familyData.events) {
            if (!ev.personRef) continue;
            if (!eventsByPerson.has(ev.personRef)) eventsByPerson.set(ev.personRef, []);
            eventsByPerson.get(ev.personRef).push(ev);
        }
    }

    // --- Undo stack ---
    const undoStack = [];
    const MAX_UNDO = 50;

    function pushUndo() {
        undoStack.push(JSON.stringify(familyData));
        if (undoStack.length > MAX_UNDO) undoStack.shift();
    }

    function performUndo() {
        if (undoStack.length === 0) return;
        const snapshot = undoStack.pop();
        familyData = JSON.parse(snapshot);
        rebuildIndexes();
        initializeCytoscape();
        hideEditForm();
        clearSearchResults();
        isDirty = true;
    }

    // Warn user before leaving with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // --- DOM References ---
    const fileInput = document.getElementById('fileInput');
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const saveButton = document.getElementById('saveButton');
    const addPersonButton = document.getElementById('addPersonButton');
    const newButton = document.getElementById('newButton');
    const undoButton = document.getElementById('undoButton');
    const searchResultsDiv = document.getElementById('searchResults');
    const cyContainer = document.getElementById('cy');
    const detailsPanel = document.getElementById('detailsPanel');
    const editForm = document.getElementById('editForm');
    const personIdInput = document.getElementById('personId');
    const personGivenNameInput = document.getElementById('personGivenName');
    const personSurnameInput = document.getElementById('personSurname');
    const personGenderInput = document.getElementById('personGender');
    const saveChangesButton = document.getElementById('saveChangesButton');
    const cancelEditButton = document.getElementById('cancelEditButton');
    const editStatus = document.getElementById('editStatus');
    const parentFamilySelect = document.getElementById('parentFamilySelect');
    const spouseFamilySelect = document.getElementById('spouseFamilySelect');
    const nameTypeSelect = document.getElementById('nameType');
    const addNameButton = document.getElementById('addNameButton');
    const additionalNamesDiv = document.getElementById('additionalNames');
    const eventsContainer = document.getElementById('eventsContainer');
    const addEventButton = document.getElementById('addEventButton');
    const saveAsHtmlButton = document.getElementById('saveAsHtmlButton');
    const saveAsSvgTreeButton = document.getElementById('saveAsSvgTreeButton');
    const fitButton = document.getElementById('fitButton');
    const deletePersonButton = document.getElementById('deletePersonButton');
    
    // --- Event Listeners ---
    fileInput.addEventListener('change', handleFileLoad);
    searchButton.addEventListener('click', handleSearch);
    searchInput.addEventListener('keyup', (event) => {
        if (event.key === "Enter") {
            handleSearch();
        }
    });
    saveButton.addEventListener('click', handleSaveFile);
    addPersonButton.addEventListener('click', handleAddPerson);
    newButton.addEventListener('click', handleNewTree);
    saveChangesButton.addEventListener('click', handleSaveChanges);
    cancelEditButton.addEventListener('click', hideEditForm);
    addNameButton.addEventListener('click', addNameField);
    addEventButton.addEventListener('click', () => addEventField());
    saveAsHtmlButton.addEventListener('click', handleSaveAsHtml);
    if (saveAsSvgTreeButton) saveAsSvgTreeButton.addEventListener('click', handleSaveAsSvgTree);
    if (undoButton) undoButton.addEventListener('click', performUndo);
    if (deletePersonButton) deletePersonButton.addEventListener('click', handleDeletePerson);
    fitButton.addEventListener('click', () => {
        if (cy) {
            cy.animate({ fit: { eles: cy.elements(), padding: 40 } }, { duration: 400 });
        }
    });

    // Keyboard shortcut: Ctrl+Z for undo
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            // Don't intercept if user is typing in an input/select
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            e.preventDefault();
            performUndo();
        }
    });


    // --- Functions ---

    function findPerson(pid) {
        return peopleById.get(pid);
    }

    function findFamily(fid) {
        return familiesById.get(fid);
    }

    /** Remove families that have no partners and no children. */
    function cleanupOrphanedFamilies() {
        familyData.families = familyData.families.filter(f => {
            const hasPartners = (f.partners || []).length > 0;
            const hasChildren = (f.children || []).length > 0;
            return hasPartners || hasChildren;
        });
    }

    /** Delete the currently-editing person and all their references. */
    function handleDeletePerson() {
        if (!currentlyEditingPersonId) return;
        const person = findPerson(currentlyEditingPersonId);
        if (!person) return;

        const displayName = getDisplayName(person);
        if (!confirm(t('deleteConfirm', { name: displayName }))) {
            return;
        }

        pushUndo();

        const pid = person.id;

        // Remove person from all families (as partner and as child)
        familyData.families.forEach(f => {
            f.partners = (f.partners || []).filter(id => id !== pid);
            f.children = (f.children || []).filter(id => id !== pid);
        });

        // Remove all events referencing this person
        familyData.events = familyData.events.filter(ev => ev.personRef !== pid);

        // Remove the person record itself
        familyData.people = familyData.people.filter(p => p.id !== pid);

        // Clean up now-empty families
        cleanupOrphanedFamilies();

        rebuildIndexes();
        initializeCytoscape();
        hideEditForm();
        clearSearchResults();
        isDirty = true;

        editStatus.textContent = t('personDeleted', { name: displayName });
        editStatus.style.color = 'green';
    }

    /** Return an array of IDs that appear more than once in a list of {id} objects. */
    function findDuplicateIds(arr) {
        const seen = new Set();
        const dups = new Set();
        for (const item of arr) {
            if (seen.has(item.id)) dups.add(item.id);
            else seen.add(item.id);
        }
        return [...dups];
    }

    /**
     * Strip dangling references from familyData in-place.
     * Returns the number of individual refs removed.
     */
    function repairDanglingRefs(data) {
        const personIds = new Set(data.people.map(p => p.id));
        const familyIds = new Set(data.families.map(f => f.id));
        let removed = 0;

        // Person refs: familiesAsChild / familiesAsSpouse must point to existing families
        for (const p of data.people) {
            if (p.familiesAsChild) {
                const before = p.familiesAsChild.length;
                p.familiesAsChild = p.familiesAsChild.filter(fid => familyIds.has(fid));
                removed += before - p.familiesAsChild.length;
            }
            if (p.familiesAsSpouse) {
                const before = p.familiesAsSpouse.length;
                p.familiesAsSpouse = p.familiesAsSpouse.filter(fid => familyIds.has(fid));
                removed += before - p.familiesAsSpouse.length;
            }
        }

        // Family refs: partners / children must point to existing people
        for (const f of data.families) {
            if (f.partners) {
                const before = f.partners.length;
                f.partners = f.partners.filter(pid => personIds.has(pid));
                removed += before - f.partners.length;
            }
            if (f.children) {
                const before = f.children.length;
                f.children = f.children.filter(pid => personIds.has(pid));
                removed += before - f.children.length;
            }
        }

        // Event refs: personRef must point to an existing person
        const beforeEvents = data.events.length;
        data.events = data.events.filter(ev => !ev.personRef || personIds.has(ev.personRef));
        removed += beforeEvents - data.events.length;

        return removed;
    }

    /**
     * Build the family members table data array (used by PDF and HTML export).
     * @returns {string[][]} Table rows including header row.
     */
    function buildFamilyTableData() {
        const tableData = [
            [t('tableId'), t('tableName'), t('tableGender'), t('tableBirth'), t('tableDeath'), t('tableParents'), t('tableSpouses'), t('tableChildren')]
        ];

        familyData.people.forEach(person => {
            const displayName = getDisplayName(person);
            const personEvts = eventsByPerson.get(person.id) || [];
            const birthEvent = personEvts.find(e => e.type === 'birth');
            const deathEvent = personEvts.find(e => e.type === 'death');

            const parents = (person.familiesAsChild || [])
                .map(famId => {
                    const family = findFamily(famId);
                    return family?.partners?.map(pid => getDisplayName(findPerson(pid))).join(', ');
                }).filter(Boolean).join('; ') || '';

            const spouses = (person.familiesAsSpouse || [])
                .map(famId => {
                    const family = findFamily(famId);
                    return family?.partners?.filter(pid => pid !== person.id)
                        .map(pid => getDisplayName(findPerson(pid))).join(', ');
                }).filter(Boolean).join('; ') || '';

            const children = (person.familiesAsSpouse || [])
                .map(famId => {
                    const family = findFamily(famId);
                    return family?.children?.map(cid => getDisplayName(findPerson(cid))).join(', ');
                }).filter(Boolean).join('; ') || '';

            tableData.push([
                person.id,
                displayName,
                person.gender || '',
                birthEvent?.date?.value || '',
                deathEvent?.date?.value || '',
                parents,
                spouses,
                children
            ]);
        });

        return tableData;
    }


    
    function handleFileLoad(event) {
        const file = event.target.files[0];
        if (!file) return;

        // --- #7  File size guard (5 MB) ---
        const MAX_FILE_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            alert(t('fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(1) }));
            fileInput.value = '';
            return;
        }

        currentFileName = file.name; // Store the loaded file name
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                // Basic validation (check if essential arrays exist)
                if (data && Array.isArray(data.people) && Array.isArray(data.families)) {
                    familyData = data;
                    // Ensure all top-level arrays exist if missing in file
                    familyData.events = familyData.events || [];
                    familyData.places = familyData.places || [];
                    familyData.sources = familyData.sources || [];
                    familyData.notes = familyData.notes || [];
                    familyData.meta = familyData.meta || {};

                    // --- #6  Duplicate ID detection ---
                    const warnings = [];
                    const dupPeople = findDuplicateIds(familyData.people);
                    const dupFamilies = findDuplicateIds(familyData.families);
                    if (dupPeople.length > 0) {
                        warnings.push(`Duplicate person IDs: ${dupPeople.join(', ')}`);
                    }
                    if (dupFamilies.length > 0) {
                        warnings.push(`Duplicate family IDs: ${dupFamilies.join(', ')}`);
                    }

                    // --- #5  Referential integrity ---
                    const integrityIssues = repairDanglingRefs(familyData);
                    if (integrityIssues > 0) {
                        warnings.push(`Removed ${integrityIssues} dangling reference(s)`);
                    }

                    if (warnings.length > 0) {
                        console.warn('Data issues found on load:', warnings);
                        alert(t('dataLoadedWarnings') + '\n• ' + warnings.join('\n• '));
                    }

                    console.log("Family data loaded:", familyData);
                    rebuildIndexes();
                    initializeCytoscape();
                    clearSearchResults();
                    hideEditForm();
                    isDirty = false; // Fresh load, no unsaved changes
                } else {
                    alert(t('invalidJsonFormat'));
                }
            } catch (error) {
                alert(t('errorParsingJson', { error: error.message }));
                console.error("JSON Parsing Error:", error);
            }
        };
        reader.onerror = () => {
            alert(t('errorReadingFile', { error: reader.error }));
        };
        reader.readAsText(file);
    }

    function initializeCytoscape() {
        if (cy) cy.destroy();
        cy = Zupu.createGraph(cyContainer, familyData, {
            getDisplayName,
            getPersonLifespan: (pid) => Zupu.utils.getPersonLifespan(pid, eventsByPerson),
            onNodeTap: (nodeId) => displayPersonDetails(nodeId),
        });
    }

    function displayPersonDetails(personId) {
        const person = findPerson(personId);
        if (!person) {
            hideEditForm();
            return;
        }

        currentlyEditingPersonId = personId;

        // Clear existing additional names
        additionalNamesDiv.innerHTML = '';

        // Handle names
        if (person.names && person.names.length > 0) {
            // Set primary name in main form
            const primaryName = person.names[0];
            nameTypeSelect.value = primaryName.type || 'birth';
            personGivenNameInput.value = primaryName.given || '';
            personSurnameInput.value = primaryName.surname || '';

            // Add additional names
            for (let i = 1; i < person.names.length; i++) {
                addNameField(person.names[i]);
            }
        } else {
            // Reset form for no names
            nameTypeSelect.value = 'birth';
            personGivenNameInput.value = '';
            personSurnameInput.value = '';
        }

        personIdInput.value = person.id;
        personGenderInput.value = person.gender || ''; // Will match one of the select options
        
        // Update family selectors
        updateFamilySelectors(person);
        
        saveChangesButton.textContent = t('saveChanges');
        if (deletePersonButton) deletePersonButton.classList.remove('hidden');
        detailsPanel.querySelector('h2').textContent = t('detailsEdit') + ': ' + personSurnameInput.value + ' ' + personGivenNameInput.value;
        detailsPanel.querySelector('p').classList.add('hidden');
        editForm.classList.remove('hidden');
        editStatus.textContent = '';

        // Clear and populate events
        eventsContainer.innerHTML = '';
        
        if (person) {
            // Get all events for this person via index
            const personEvents = eventsByPerson.get(person.id) || [];
            personEvents.forEach(event => {
                addEventField(event);
            });
        }
    }

    function hideEditForm() {
        editForm.classList.add('hidden');
        detailsPanel.querySelector('h2').textContent = t('detailsEdit');
        detailsPanel.querySelector('p').classList.remove('hidden');
        currentlyEditingPersonId = null;
        editStatus.textContent = '';
    }

     function handleAddPerson() {
        const newId = generateId('p');
        currentlyEditingPersonId = newId;

        personIdInput.value = newId;
        personGivenNameInput.value = '';
        personSurnameInput.value = '';
        personGenderInput.value = ''; // Reset to default "Select gender..." option
        nameTypeSelect.value = 'birth';
        additionalNamesDiv.innerHTML = ''; // Clear any additional name fields
        eventsContainer.innerHTML = ''; // Clear any existing events
        
        // Reset family selectors
        updateFamilySelectors();
        
        detailsPanel.querySelector('h2').textContent = t('addPerson');
        detailsPanel.querySelector('p').classList.add('hidden');
        editForm.classList.remove('hidden');
        saveChangesButton.textContent = t('addPersonBtn');
        if (deletePersonButton) deletePersonButton.classList.add('hidden');
        editStatus.textContent = '';

        // Clear selection in group
        if (cy) {
            cy.$(':selected').unselect();
        }
    }


    function handleSaveChanges() {
        const personId = personIdInput.value;
        const gender = personGenderInput.value;

        if (!personId) return;

        // Snapshot for undo before any mutation
        pushUndo();

        // Collect all names
        const names = [{
            type: nameTypeSelect.value,
            given: personGivenNameInput.value.trim(),
            surname: personSurnameInput.value.trim()
        }];

        // Add additional names
        additionalNamesDiv.querySelectorAll('.additional-name').forEach(nameDiv => {
            names.push({
                type: nameDiv.querySelector('.name-type').value,
                given: nameDiv.querySelector('.given-name').value.trim(),
                surname: nameDiv.querySelector('.surname').value.trim()
            });
        });

        // Validate that at least one name has some content
        const hasValidName = names.some(name => name.given || name.surname);
        if (!hasValidName) {
            editStatus.textContent = t('errorNoName');
            editStatus.style.color = 'red';
            return;
        }

        let person = findPerson(personId);
        let isNewPerson = false;

        if (!person) {
            person = {
                id: personId,
                names: [],
                gender: gender,
                eventRefs: [],
                familiesAsSpouse: [],
                familiesAsChild: [],
                noteRefs: []
            };
            familyData.people.push(person);
            isNewPerson = true;
        }

        // Update person's names
        person.names = names.filter(name => name.given || name.surname); // Only keep names with content
        person.gender = gender;

        // Handle family relationships
        const selectedParentFamily = parentFamilySelect.value;
        const selectedSpouseFamily = spouseFamilySelect.value;

        // Update parent family relationship
        if (selectedParentFamily) {
            const parentFamily = findFamily(selectedParentFamily);
            if (parentFamily) {
                // Remove person from any existing parent families
                familyData.families.forEach(f => {
                    f.children = (f.children || []).filter(id => id !== person.id);
                });
                
                // Add to new parent family
                parentFamily.children = parentFamily.children || [];
                if (!parentFamily.children.includes(person.id)) {
                    parentFamily.children.push(person.id);
                }
                person.familiesAsChild = [selectedParentFamily];
            }
        }

        // Handle spouse family relationship
        if (selectedSpouseFamily) {
            // Remove person from any existing spouse families first
            familyData.families.forEach(f => {
                if (f.partners) {
                    f.partners = f.partners.filter(id => id !== person.id);
                }
            });
            person.familiesAsSpouse = []; // Reset spouse families

            if (selectedSpouseFamily === 'new') {
                // Create new family
                const familyId = generateId('f');
                const spouseFamily = {
                    id: familyId,
                    partners: [person.id],
                    children: [],
                    eventRefs: [],
                    noteRefs: []
                };
                familyData.families.push(spouseFamily);
                person.familiesAsSpouse = [familyId];
            } else {
                const spouseFamily = findFamily(selectedSpouseFamily);
                if (spouseFamily) {
                    spouseFamily.partners = spouseFamily.partners || [];
                    if (!spouseFamily.partners.includes(person.id)) {
                        spouseFamily.partners.push(person.id);
                    }
                    person.familiesAsSpouse = [selectedSpouseFamily]; // Replace instead of push
                }
            }
        }

        // Handle events
        // First, remove all existing events for this person
        familyData.events = familyData.events.filter(event => event.personRef !== person.id);
        
        // Collect and add new/updated events
        const eventElements = eventsContainer.querySelectorAll('.event-item');
        eventElements.forEach(eventElement => {
            const eventId = eventElement.querySelector('.event-id').value;
            const eventTypeSelect = eventElement.querySelector('.event-type').value;
            const eventCustomType = eventElement.querySelector('.event-custom-type').value.trim();
            const eventType = (eventTypeSelect === 'other' && eventCustomType) ? eventCustomType : eventTypeSelect;
            const eventDate = eventElement.querySelector('.event-date').value.trim();
            const eventDateQualifier = eventElement.querySelector('.event-date-qualifier').value;
            const eventPlace = eventElement.querySelector('.event-place').value.trim();

            // Only add event if it has at least a type and date or place
            if (eventType && (eventDate || eventPlace)) {
                const event = {
                    id: eventId,
                    type: eventType,
                    personRef: person.id,
                    date: eventDate ? {
                        value: eventDate,
                        qualifier: eventDateQualifier
                    } : undefined,
                    placeRef: eventPlace || undefined
                };
                familyData.events.push(event);
            }
        });

        // Rebuild indexes after mutation
        rebuildIndexes();

        // Remove families left with no partners and no children
        cleanupOrphanedFamilies();
        rebuildIndexes();

        // Update Cytoscape graph
        if (cy) {
            // Instead of just updating the node, reinitialize the entire graph
            // to show new relationships
            initializeCytoscape();
            
            // After reinitializing, select and center on the current person
            const node = cy.getElementById(personId);
            if (node) {
                node.select();
                cy.animate({
                    center: { eles: node },
                    zoom: 1.5
                }, { duration: 500 });
            }
        }

        editStatus.textContent = t('changesSaved');
        editStatus.style.color = 'green';
        isDirty = true; // Mark as having unsaved changes
        detailsPanel.querySelector('h2').textContent = t('detailsEdit') + ': ' + personGivenNameInput.value + ' ' + personSurnameInput.value; // Update panel title

        // Optionally hide form after a short delay
        // setTimeout(hideEditForm, 1500);
    }


    function handleSearch() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        clearSearchResults();
        if (!searchTerm) return;

        // Build results: each entry is { person, matchHint }
        const results = [];
        for (const person of familyData.people) {
            // Match by name
            const nameMatch = person.names.some(name =>
                (name.given?.toLowerCase().includes(searchTerm) ||
                 name.surname?.toLowerCase().includes(searchTerm))
            );
            if (nameMatch) {
                results.push({ person, matchHint: '' });
                continue;
            }

            // Match by event date or place
            const personEvents = eventsByPerson.get(person.id) || [];
            let matchHint = '';
            for (const ev of personEvents) {
                const dateVal = (ev.date?.value || '').toLowerCase();
                const placeVal = (ev.placeRef || '').toLowerCase();
                if (dateVal.includes(searchTerm)) {
                    matchHint = `${ev.type}: ${ev.date.value}`;
                    break;
                }
                if (placeVal.includes(searchTerm)) {
                    matchHint = `${ev.type}: ${ev.placeRef}`;
                    break;
                }
            }
            if (matchHint) {
                results.push({ person, matchHint });
            }
        }

        if (results.length === 0) {
            searchResultsDiv.textContent = t('noResults');
        } else {
            results.forEach(({ person, matchHint }) => {
                const displayName = getDisplayName(person);
                const span = document.createElement('span');
                span.textContent = matchHint ? `${displayName} (${matchHint})` : displayName;
                span.classList.add('search-result-item');
                span.dataset.id = person.id;
                span.title = t('clickToView', { name: displayName, id: person.id });
                span.addEventListener('click', () => {
                    displayPersonDetails(person.id);
                    if (cy) {
                        cy.$(':selected').unselect();
                        const node = cy.getElementById(person.id);
                        if (node) {
                            node.select();
                            cy.animate({
                                center: { eles: node },
                                zoom: 1.5
                            }, { duration: 500 });
                        }
                    }
                });
                searchResultsDiv.appendChild(span);
            });
        }
    }

     function clearSearchResults() {
        searchResultsDiv.innerHTML = '';
     }

    function handleSaveFile() {
        if (familyData.people.length === 0 && familyData.families.length === 0) {
            alert(t('noDataToSave'));
            return;
        }

        // Optional: Update metadata before saving
        familyData.meta = familyData.meta || {};
        familyData.meta.lastSaved = new Date().toISOString();

        try {
            const jsonData = JSON.stringify(familyData, null, 2); // Pretty print JSON
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            
            // If we have a current file name (loaded file), use it
            if (currentFileName) {
                a.download = currentFileName;
            } else {
                // For new files, prompt for filename
                const defaultFilename = "family_tree.json";
                const filename = prompt(t('enterFilename'), defaultFilename);
                if (!filename) {
                    URL.revokeObjectURL(url);
                    return; // User cancelled
                }
                a.download = filename.endsWith('.json') ? filename : filename + '.json';
                currentFileName = a.download; // Store the new filename
            }

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            editStatus.textContent = currentFileName ? 
                t('fileSavedAs', { name: currentFileName }) : 
                t('fileSaved');
            editStatus.style.color = 'green';
            isDirty = false; // Clear dirty flag after successful save

        } catch (error) {
            alert(t('errorSavingFile', { error: error.message }));
            console.error("Saving Error:", error);
        }
    }

    // Add new function to update family selectors
    function updateFamilySelectors(person = null) {
        // Clear existing options
        parentFamilySelect.innerHTML = '<option value="">' + escapeHtml(t('selectParentFamily')) + '</option>';
        spouseFamilySelect.innerHTML = '<option value="">' + escapeHtml(t('selectSpouseFamily')) + '</option>';

        // Add "Create New Family" option for spouse selector
        const newFamilyOption = new Option(t('createNewFamily'), 'new');
        spouseFamilySelect.appendChild(newFamilyOption);

        // Add existing families as options
        familyData.families.forEach(family => {
            const partners = family.partners || [];
            const children = family.children || [];
            
            // Create display text for family
            const partnerNames = partners.map(pid => {
                const partner = findPerson(pid);
                return getDisplayName(partner) || pid;
            }).join(' & ');

            const familyLabel = partnerNames ? t('familyLabel', { names: partnerNames }) : t('familyLabelId', { id: family.id });

            // Add to parent family selector if person isn't a partner
            if (!partners.includes(person?.id)) {
                const option = new Option(familyLabel, family.id);
                parentFamilySelect.appendChild(option);
            }

            // Add to spouse family selector if person isn't a child
            if (!children.includes(person?.id)) {
                const option = new Option(familyLabel, family.id);
                spouseFamilySelect.appendChild(option);
            }
        });

        // If editing existing person, select their current families
        if (person) {
            if (person.familiesAsChild?.[0]) {
                parentFamilySelect.value = person.familiesAsChild[0];
            }
            if (person.familiesAsSpouse?.[0]) {
                spouseFamilySelect.value = person.familiesAsSpouse[0];
            }
        }
    }

    function addNameField(nameData = null) {
        const nameDiv = document.createElement('div');
        nameDiv.className = 'additional-name name-group';
        
        nameDiv.innerHTML = `
            <select class="name-type">
                <option value="birth" ${nameData?.type === 'birth' ? 'selected' : ''}>${t('nameBirth')}</option>
                <option value="married" ${nameData?.type === 'married' ? 'selected' : ''}>${t('nameMarried')}</option>
                <option value="adopted" ${nameData?.type === 'adopted' ? 'selected' : ''}>${t('nameAdopted')}</option>
                <option value="nickname" ${nameData?.type === 'nickname' ? 'selected' : ''}>${t('nameNickname')}</option>
            </select><br>
            <label>${t('givenName')}</label>
            <input type="text" class="given-name" value="${escapeHtml(nameData?.given)}"><br>
            <label>${t('surname')}</label>
            <input type="text" class="surname" value="${escapeHtml(nameData?.surname)}">
            <button type="button" class="remove-name-button">${t('removeBtn')}</button>
        `;

        nameDiv.querySelector('.remove-name-button').addEventListener('click', () => {
            nameDiv.remove();
        });

        additionalNamesDiv.appendChild(nameDiv);
    }

    const PREDEFINED_EVENT_TYPES = ['birth', 'death', 'marriage', 'divorce', 'residence', 'burial'];

    function addEventField(eventData = null) {
        const eventDiv = document.createElement('div');
        eventDiv.className = 'event-item';
        
        // Generate a unique event ID if this is a new event
        const eventId = eventData?.id || generateId('e');

        // Determine if the existing type is a custom (non-predefined) one
        const existingType = eventData?.type || '';
        const isCustomType = existingType && !PREDEFINED_EVENT_TYPES.includes(existingType) && existingType !== 'other';
        const selectValue = isCustomType ? 'other' : existingType;
        const customValue = isCustomType ? existingType : '';
        const showCustom = selectValue === 'other' || isCustomType;
        
        eventDiv.innerHTML = `
            <button type="button" class="remove-event-button">×</button>
            <input type="hidden" class="event-id" value="${escapeHtml(eventId)}">
            
            <label>${t('eventTypeLabel')}</label>
            <select class="event-type">
                <option value="birth" ${selectValue === 'birth' ? 'selected' : ''}>${t('eventBirth')}</option>
                <option value="death" ${selectValue === 'death' ? 'selected' : ''}>${t('eventDeath')}</option>
                <option value="marriage" ${selectValue === 'marriage' ? 'selected' : ''}>${t('eventMarriage')}</option>
                <option value="divorce" ${selectValue === 'divorce' ? 'selected' : ''}>${t('eventDivorce')}</option>
                <option value="residence" ${selectValue === 'residence' ? 'selected' : ''}>${t('eventResidence')}</option>
                <option value="burial" ${selectValue === 'burial' ? 'selected' : ''}>${t('eventBurial')}</option>
                <option value="other" ${selectValue === 'other' ? 'selected' : ''}>${t('eventOther')}</option>
            </select>

            <input type="text" class="event-custom-type" placeholder="${escapeHtml(t('customEventPlaceholder'))}"
                   value="${escapeHtml(customValue)}" style="display:${showCustom ? 'block' : 'none'}">

            <label>${t('dateLabel')}</label>
            <input type="text" class="event-date" placeholder="${escapeHtml(t('datePlaceholder'))}" 
                   value="${escapeHtml(eventData?.date?.value)}">

            <label>${t('dateQualifierLabel')}</label>
            <select class="event-date-qualifier">
                <option value="exact" ${eventData?.date?.qualifier === 'exact' ? 'selected' : ''}>${t('dateExact')}</option>
                <option value="about" ${eventData?.date?.qualifier === 'about' ? 'selected' : ''}>${t('dateAbout')}</option>
                <option value="before" ${eventData?.date?.qualifier === 'before' ? 'selected' : ''}>${t('dateBefore')}</option>
                <option value="after" ${eventData?.date?.qualifier === 'after' ? 'selected' : ''}>${t('dateAfter')}</option>
            </select>

            <label>${t('placeLabel')}</label>
            <input type="text" class="event-place" placeholder="${escapeHtml(t('placePlaceholder'))}"
                   value="${escapeHtml(eventData?.placeRef)}">
        `;

        // Toggle custom type input visibility when select changes
        const typeSelect = eventDiv.querySelector('.event-type');
        const customInput = eventDiv.querySelector('.event-custom-type');
        typeSelect.addEventListener('change', () => {
            const isOther = typeSelect.value === 'other';
            customInput.style.display = isOther ? 'block' : 'none';
            if (isOther) customInput.focus();
        });

        eventDiv.querySelector('.remove-event-button').addEventListener('click', () => {
            eventDiv.remove();
        });

        eventsContainer.appendChild(eventDiv);
    }

    function handleNewTree() {
        // Warn if there are unsaved changes
        if (isDirty) {
            if (!confirm(t('unsavedChangesConfirm'))) {
                return;
            }
        }

        // Reset family data to empty state
        familyData = {
            people: [],
            families: [],
            events: [],
            places: [],
            sources: [],
            notes: [],
            meta: {
                description: "New Family Tree",
                version: "1.0",
                creationDate: new Date().toISOString(),
                lastSaved: new Date().toISOString()
            }
        };

        // Clear the file input and current file name
        fileInput.value = '';
        currentFileName = null;

        rebuildIndexes();

        // Clear search results
        clearSearchResults();

        // Hide edit form
        hideEditForm();

        // Reinitialize Cytoscape with empty data
        initializeCytoscape();

        // Show success message
        editStatus.textContent = t('newTreeCreated');
        editStatus.style.color = 'green';
        isDirty = false; // New tree starts clean
    }

    function handleSaveAsHtml() {
        if (familyData.people.length === 0 && familyData.families.length === 0) {
            alert(t('noDataToExport'));
            return;
        }
        if (!cy) {
            alert(t('graphNotInitialized'));
            return;
        }
    
        //Rescale the graph to fit the SVG
        cy.fit(cy.nodes(), 50); // Fit the graph to the viewport with a 50px padding
        cy.center(cy.nodes()); // Center the graph
        cy.resize(); // Resize the graph to fit the viewport

        // Generate SVG content
        const svgContent = cy.svg({ scale: 1 });
    
        // Build table using shared helper
        const tableData = buildFamilyTableData();
    
        // Create HTML content
        const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(t('familyTreeTitle'))}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { text-align: center; }
            svg { display: block; margin: 0 auto; border: 1px solid #ccc; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
        </style>
    </head>
    <body>
        <div class="print-button">
            <button onclick="window.print()">${escapeHtml(t('print'))}</button>
        </div>
        <h1>${escapeHtml(t('familyTreeTitle'))}</h1>
        <div>${svgContent}</div>
        <table>
            <thead>
                <tr>
                    ${tableData[0].map(header => `<th>${escapeHtml(header)}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${tableData.slice(1).map(row => `
                    <tr>
                        ${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </body>
    </html>
        `;
    
        // Open the HTML content in a new browser window
        const newWindow = window.open('', '_blank');
        newWindow.document.open();
        newWindow.document.write(htmlContent);
        newWindow.document.close();
        newWindow.focus();
    }

    // ================================================================
    // SVG Tree Export  (builder lives in svgtree.js)
    // ================================================================

    function handleSaveAsSvgTree() {
        if (familyData.people.length === 0) {
            alert(t('noDataToExportSvg'));
            return;
        }

        // If a person is currently selected, offer to build subtree from them
        let startPersonId = null;
        if (currentlyEditingPersonId) {
            const person = findPerson(currentlyEditingPersonId);
            if (person) {
                const displayName = getDisplayName(person);
                const useSubtree = confirm(t('subtreeFromPerson', { name: displayName }));
                if (useSubtree) {
                    startPersonId = currentlyEditingPersonId;
                }
            }
        }

        // Determine clan surname
        let surname = '';
        if (startPersonId) {
            // For subtree: derive surname from the selected person
            const startPerson = findPerson(startPersonId);
            if (startPerson) {
                const names = startPerson.names || [];
                const birth = names.find(n => n.type === 'birth') || names[0] || {};
                surname = birth.surname || '';
            }
        } else {
            // For full tree: use the most common surname among root people (no parents)
            const surnameCounts = {};
            for (const p of familyData.people) {
                if (!p.familiesAsChild || p.familiesAsChild.length === 0) {
                    const names = p.names || [];
                    const birth = names.find(n => n.type === 'birth') || names[0] || {};
                    const s = birth.surname || '';
                    if (s) surnameCounts[s] = (surnameCounts[s] || 0) + 1;
                }
            }
            const sorted = Object.entries(surnameCounts).sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) surname = sorted[0][0];

            const inputSurname = prompt(t('enterClanSurname'), surname);
            if (inputSurname === null) return; // cancelled
            surname = inputSurname || surname;
        }

        try {
            const svgContent = Zupu.buildTreeSvg(familyData, surname, startPersonId);

            // Open in a new window for preview + download
            const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            const newWindow = window.open('', '_blank');
            if (!newWindow) {
                alert(t('popupBlocked'));
                URL.revokeObjectURL(url);
                return;
            }
            newWindow.document.open();
            newWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(t('svgWindowTitle', { surname }))}</title>
<style>
body { margin: 0; padding: 16px; background: #f0f0f0; font-family: Arial, sans-serif; }
.toolbar { padding: 10px; background: #fff; border-bottom: 1px solid #ccc; margin-bottom: 10px;
           display: flex; gap: 10px; align-items: center; border-radius: 4px; }
.toolbar button { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;
                  background: #007bff; color: #fff; font-size: 14px; }
.toolbar button:hover { background: #0056b3; }
.svg-container { background: white; display: inline-block; border: 1px solid #ccc; border-radius: 4px; }
</style></head><body>
<div class="toolbar">
  <button onclick="downloadSvg()">${escapeHtml(t('downloadSvgBtn'))}</button>
  <span>${escapeHtml(t('scrollToExplore'))}</span>
</div>
<div class="svg-container">${svgContent}</div>
<script>
function downloadSvg() {
  var svg = document.querySelector('.svg-container svg');
  var serializer = new XMLSerializer();
  var source = serializer.serializeToString(svg);
  var blob = new Blob([source], {type: 'image/svg+xml;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = '${surname ? surname.replace(/'/g, "\\'") : 'family'}_tree.svg';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
<\/script></body></html>`);
            newWindow.document.close();
            URL.revokeObjectURL(url);
        } catch (err) {
            alert(t('errorGeneratingSvg', { error: err.message }));
            console.error(err);
        }
    }
    
}); // End DOMContentLoaded