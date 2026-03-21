//----------------------------------------------------------------
// File app.js
//
// History:
// 2025-Apr-12: Initial version
// 2026-Mar-21: Added SVG export to nuclear family tree view
//----------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // Initialize jsPDF
    window.jsPDF = window.jspdf.jsPDF;
        
    // --- Globals ---
    let familyData = { people: [], families: [], events: [], places: [], sources: [], notes: [], meta: {} };
    let cy; // Cytoscape instance
    let currentlyEditingPersonId = null;
    let currentFileName = null; // Track the currently loaded file name
    let isDirty = false; // Track unsaved changes

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
    // const saveAsPdfButton = document.getElementById('saveAsPdfButton');
    // const saveAsSvgButton = document.getElementById('saveAsSvgButton');
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
    //saveAsPdfButton.addEventListener('click', handleSaveAsPdf);
    //saveAsSvgButton.addEventListener('click', handleSaveAsSvg);
    saveAsHtmlButton.addEventListener('click', handleSaveAsHtml);
    if (saveAsSvgTreeButton) saveAsSvgTreeButton.addEventListener('click', handleSaveAsSvgTree);
    fitButton.addEventListener('click', () => {
        if (cy) {
            cy.animate({ fit: { eles: cy.elements(), padding: 40 } }, { duration: 400 });
        }
    });


    // --- Functions ---

    /** Generate a unique ID with a given prefix, safe from millisecond collisions. */
    let _idCounter = 0;
    function generateId(prefix = 'id') {
        _idCounter++;
        return `${prefix}_${Date.now()}_${_idCounter}`;
    }

    /**
     * Escape a string for safe insertion into HTML attribute values.
     * Prevents XSS when interpolating user data into innerHTML.
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Get the display name for a person, using their birth name (or first available name).
     * @param {object} person - The person object from familyData.people
     * @param {string} [order='surname-first'] - 'surname-first' for "Surname Given", 'given-first' for "Given Surname"
     * @returns {string} The display name, or the person's id as fallback
     */
    function getDisplayName(person, order = 'surname-first') {
        if (!person) return '';
        if (!person.names || person.names.length === 0) return person.id;
        const primaryName = person.names.find(n => n.type === 'birth') || person.names[0];
        const given = primaryName.given || '';
        const surname = primaryName.surname || '';
        const name = order === 'given-first'
            ? `${given} ${surname}`.trim()
            : `${surname} ${given}`.trim();
        return name || person.id;
    }

    /**
     * Look up a person object by ID.
     * @param {string} pid - The person ID
     * @returns {object|undefined}
     */
    function findPerson(pid) {
        return familyData.people.find(p => p.id === pid);
    }

    /**
     * Build the family members table data array (used by PDF and HTML export).
     * @returns {string[][]} Table rows including header row.
     */
    function buildFamilyTableData() {
        const tableData = [
            ['ID', 'Name', 'Gender', 'Birth', 'Death', 'Parents', 'Spouses', 'Children']
        ];

        familyData.people.forEach(person => {
            const displayName = getDisplayName(person);
            const birthEvent = familyData.events.find(e => e.personRef === person.id && e.type === 'birth');
            const deathEvent = familyData.events.find(e => e.personRef === person.id && e.type === 'death');

            const parents = (person.familiesAsChild || [])
                .map(famId => {
                    const family = familyData.families.find(f => f.id === famId);
                    return family?.partners?.map(pid => getDisplayName(findPerson(pid))).join(', ');
                }).filter(Boolean).join('; ') || '';

            const spouses = (person.familiesAsSpouse || [])
                .map(famId => {
                    const family = familyData.families.find(f => f.id === famId);
                    return family?.partners?.filter(pid => pid !== person.id)
                        .map(pid => getDisplayName(findPerson(pid))).join(', ');
                }).filter(Boolean).join('; ') || '';

            const children = (person.familiesAsSpouse || [])
                .map(famId => {
                    const family = familyData.families.find(f => f.id === famId);
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

    function getPersonLifespan(personId, events) {
        if (!events || events.length === 0) {
            return ""; // No events data available
        }
    
        let birthYear = null;
        let deathYear = null;
    
        // Find birth and death events specifically for this person
        const personEvents = events.filter(e => e.personRef === personId);
    
        const birthEvent = personEvents.find(e => e.type === 'birth' && e.date?.value);
        const deathEvent = personEvents.find(e => e.type === 'death' && e.date?.value);
    
        // Very basic year extraction (assumes YYYY format at the start)
        // A more robust solution would handle 'c.', 'abt.', ranges, etc.
        const yearRegex = /^(\d{4})/;
    
        if (birthEvent) {
            const match = birthEvent.date.value.match(yearRegex);
            if (match) birthYear = match[1];
        }
        if (deathEvent) {
            const match = deathEvent.date.value.match(yearRegex);
            if (match) deathYear = match[1];
        }
    
        if (birthYear && deathYear) {
            return `(${birthYear} - ${deathYear})`;
        } else if (birthYear) {
            return `(b. ${birthYear})`;
        } else if (deathYear) {
            return `(d. ${deathYear})`;
        } else {
            return ""; // No relevant year found
        }
    }
    
    
    function handleFileLoad(event) {
        const file = event.target.files[0];
        if (!file) return;

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
                    console.log("Family data loaded:", familyData);
                    initializeCytoscape();
                    clearSearchResults();
                    hideEditForm();
                    isDirty = false; // Fresh load, no unsaved changes
                } else {
                    alert("Invalid JSON format. Missing 'people' or 'families' array.");
                }
            } catch (error) {
                alert(`Error parsing JSON file: ${error.message}`);
                console.error("JSON Parsing Error:", error);
            }
        };
        reader.onerror = () => {
            alert(`Error reading file: ${reader.error}`);
        };
        reader.readAsText(file);
    }

    function initializeCytoscape() {
        if (cy) {
            cy.destroy(); // Destroy previous instance if exists
        }

        const elements = [];

        // 1. Create Nodes (People)
        familyData.people.forEach(person => {
            // --- Build the Multi-line Label ---
            const displayName = getDisplayName(person);
    
            const gender = person.gender ? person.gender.charAt(0).toUpperCase() : ''; // e.g., M, F or empty
            const lifespan = getPersonLifespan(person.id, familyData.events); // Pass events array
    
            // Combine info with newlines (\n)
            let fullLabel = displayName;
            if (gender) {
                fullLabel += `\n[${gender}]`; // Add gender like [M] or [F]
            }
            if (lifespan) {
                fullLabel += `\n${lifespan}`;
            }
            // --- End Label Building ---
    
            elements.push({
                group: 'nodes',
                data: {
                    id: person.id,
                    // Use the full multi-line label for the 'name' data field
                    // The style selector 'label': 'data(name)' will pick this up.
                    name: fullLabel,
                    // Keep raw gender for potential specific styling rules
                    gender: person.gender || 'unknown',
                }
            });
        });

        // 2. Create Edges (Family Relationships)
        familyData.families.forEach(family => {
            const partners = family.partners || [];
            const children = family.children || [];
            const familyNodeId = `fnode_${family.id}`;

            if (partners.length > 0) {
                // Always create a family node if there are partners
                elements.push({
                    group: 'nodes',
                    data: { id: familyNodeId, isFamilyNode: true }
                });

                // Connect all partners to the family node
                partners.forEach(partnerId => {
                    elements.push({
                        group: 'edges',
                        data: {
                            id: `edge_${partnerId}_${familyNodeId}`,
                            source: partnerId,
                            target: familyNodeId,
                            isPartnerEdge: true
                        },
                        classes: 'partner-edge'
                    });
                });

                // If there are children, connect them to the family node
                if (children.length > 0) {
                    children.forEach(childId => {
                        elements.push({
                            group: 'edges',
                            data: {
                                id: `edge_${familyNodeId}_${childId}`,
                                source: familyNodeId,
                                target: childId,
                                isChildEdge: true
                            },
                            classes: 'child-edge'
                        });
                    });
                }
            }
        });

        cy = cytoscape({
            container: cyContainer,
            elements: elements,
            style: [
                // --- Person nodes (default) ---
                {
                    selector: 'node[!isFamilyNode]',
                    style: {
                        'label': 'data(name)',
                        'width': 120,
                        'height': 60,
                        'padding': '12px',
                        'shape': 'round-rectangle',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'color': '#fff',
                        'font-size': '10px',
                        'font-weight': 'bold',
                        'text-wrap': 'wrap',
                        'text-max-width': '110px',
                        'line-height': 1.3,
                        'background-color': '#888',
                        'border-width': 2,
                        'border-color': '#666',
                        'border-opacity': 0.8,
                        'text-outline-width': 1,
                        'text-outline-color': 'rgba(0,0,0,0.3)',
                    }
                },
                // --- Male nodes ---
                {
                    selector: 'node[gender="male"]',
                    style: {
                        'background-color': '#3A7BD5',
                        'border-color': '#2A5BA0',
                        'shape': 'round-rectangle',
                    }
                },
                // --- Female nodes ---
                {
                    selector: 'node[gender="female"]',
                    style: {
                        'background-color': '#D5538A',
                        'border-color': '#A03A6A',
                        'shape': 'round-rectangle',
                    }
                },
                // --- Family junction nodes (small, visible connector dot) ---
                {
                    selector: 'node[?isFamilyNode]',
                    style: {
                        'width': 12,
                        'height': 12,
                        'background-color': '#E8963A',
                        'border-width': 2,
                        'border-color': '#C07828',
                        'shape': 'diamond',
                        'label': '',
                    }
                },
                // --- Default edge style ---
                {
                    selector: 'edge',
                    style: {
                        'width': 2,
                        'line-color': '#999',
                        'target-arrow-shape': 'none',
                        'curve-style': 'taxi',       // Right-angle routing — much cleaner for trees
                        'taxi-direction': 'downward',
                        'taxi-turn': '50%',
                    }
                },
                // --- Partner (spouse) edges ---
                {
                    selector: '.partner-edge',
                    style: {
                        'line-color': '#E8963A',
                        'line-style': 'solid',
                        'width': 2.5,
                        'curve-style': 'straight',   // Straight horizontal line between spouses
                    }
                },
                // --- Parent → child edges ---
                {
                    selector: '.child-edge',
                    style: {
                        'line-color': '#78909C',
                        'width': 2,
                        'target-arrow-shape': 'triangle',
                        'target-arrow-color': '#78909C',
                        'arrow-scale': 1.0,
                    }
                },
                // --- Selected node highlight ---
                {
                    selector: ':selected',
                    style: {
                        'border-width': 4,
                        'border-color': '#FFD600',
                        'background-blacken': -0.15,  // Slightly lighten to emphasize
                    }
                },
                // --- Hover effect for person nodes ---
                {
                    selector: 'node[!isFamilyNode]:active',
                    style: {
                        'overlay-color': '#FFD600',
                        'overlay-opacity': 0.15,
                    }
                },
            ],
            layout: {
                name: 'dagre',
                rankDir: 'TB',
                spacingFactor: 1.5,
                rankSep: 120,  // Generous vertical gap between generations
                nodeSep: 60,   // Horizontal gap between sibling nodes
                edgeSep: 30,
                ranker: 'tight-tree',  // Better ranking for family trees
            },
            minZoom: 0.1,
            maxZoom: 4,
            wheelSensitivity: 0.3,
            zoomingEnabled: true,
            userZoomingEnabled: true,
            boxSelectionEnabled: false,  // Avoid accidental box select
        });

        // --- Cytoscape Event Handlers ---
        cy.on('tap', 'node[!isFamilyNode]', (event) => { // Only react to taps on people nodes
            const nodeId = event.target.id();
            displayPersonDetails(nodeId);
            cy.$(':selected').unselect(); // Unselect previous
            event.target.select(); // Select the tapped node
        });

        // Auto-fit the graph into view after layout completes
        cy.on('layoutstop', () => {
            cy.fit(cy.elements(), 40);
        });
    }

    function displayPersonDetails(personId) {
        const person = familyData.people.find(p => p.id === personId);
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
        
        detailsPanel.querySelector('h2').textContent = `Details / Edit: ${personSurnameInput.value} ${personGivenNameInput.value}`;
        detailsPanel.querySelector('p').classList.add('hidden');
        editForm.classList.remove('hidden');
        editStatus.textContent = '';

        // Clear and populate events
        eventsContainer.innerHTML = '';
        
        if (person) {
            // Get all events for this person
            const personEvents = familyData.events.filter(event => event.personRef === person.id);
            personEvents.forEach(event => {
                addEventField(event);
            });
        }
    }

    function hideEditForm() {
        editForm.classList.add('hidden');
        detailsPanel.querySelector('h2').textContent = 'Details / Edit';
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
        
        detailsPanel.querySelector('h2').textContent = 'Add New Person';
        detailsPanel.querySelector('p').classList.add('hidden');
        editForm.classList.remove('hidden');
        saveChangesButton.textContent = "Add Person";
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
            editStatus.textContent = 'Error: Please enter at least one name.';
            editStatus.style.color = 'red';
            return;
        }

        let person = familyData.people.find(p => p.id === personId);
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
            const parentFamily = familyData.families.find(f => f.id === selectedParentFamily);
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
                const spouseFamily = familyData.families.find(f => f.id === selectedSpouseFamily);
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

        editStatus.textContent = 'Changes saved!';
        editStatus.style.color = 'green';
        isDirty = true; // Mark as having unsaved changes
        detailsPanel.querySelector('h2').textContent = `Details / Edit: ${personGivenNameInput.value} ${personSurnameInput.value}`; // Update panel title

        // Optionally hide form after a short delay
        // setTimeout(hideEditForm, 1500);
    }


    function handleSearch() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        clearSearchResults();
        if (!searchTerm) return;

        const results = familyData.people.filter(person => {
            return person.names.some(name =>
                (name.given?.toLowerCase().includes(searchTerm) ||
                 name.surname?.toLowerCase().includes(searchTerm))
            );
        });

        if (results.length === 0) {
            searchResultsDiv.textContent = 'No results found.';
        } else {
            results.forEach(person => {
                const displayName = getDisplayName(person);
                const span = document.createElement('span');
                span.textContent = displayName;
                span.classList.add('search-result-item');
                span.dataset.id = person.id; // Store ID for click handling
                span.title = `Click to view details for ${displayName} (${person.id})`;
                span.addEventListener('click', () => {
                    displayPersonDetails(person.id);
                     // Highlight and maybe zoom in Cytoscape
                     if (cy) {
                         cy.$(':selected').unselect(); // Unselect others
                         const node = cy.getElementById(person.id);
                         if(node) {
                             node.select();
                             cy.animate({
                                 center: { eles: node },
                                 zoom: 1.5 // Zoom level
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
            alert("No data to save.");
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
                const filename = prompt("Enter filename to save:", defaultFilename);
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
                `File "${currentFileName}" saved successfully!` : 
                'File saved successfully!';
            editStatus.style.color = 'green';
            isDirty = false; // Clear dirty flag after successful save

        } catch (error) {
            alert(`Error saving file: ${error.message}`);
            console.error("Saving Error:", error);
        }
    }

    // Add new function to update family selectors
    function updateFamilySelectors(person = null) {
        // Clear existing options
        parentFamilySelect.innerHTML = '<option value="">Select Parent Family...</option>';
        spouseFamilySelect.innerHTML = '<option value="">Select/Create Spouse Family...</option>';

        // Add "Create New Family" option for spouse selector
        const newFamilyOption = new Option('Create New Family...', 'new');
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

            const familyLabel = partnerNames ? `Family: ${partnerNames}` : `Family ${family.id}`;

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
                <option value="birth" ${nameData?.type === 'birth' ? 'selected' : ''}>Birth Name</option>
                <option value="married" ${nameData?.type === 'married' ? 'selected' : ''}>Married Name</option>
                <option value="adopted" ${nameData?.type === 'adopted' ? 'selected' : ''}>Adopted Name</option>
                <option value="nickname" ${nameData?.type === 'nickname' ? 'selected' : ''}>Nickname</option>
            </select><br>
            <label>Given Name:</label>
            <input type="text" class="given-name" value="${escapeHtml(nameData?.given)}"><br>
            <label>Surname:</label>
            <input type="text" class="surname" value="${escapeHtml(nameData?.surname)}">
            <button type="button" class="remove-name-button">Remove</button>
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
            
            <label>Event Type:</label>
            <select class="event-type">
                <option value="birth" ${selectValue === 'birth' ? 'selected' : ''}>Birth</option>
                <option value="death" ${selectValue === 'death' ? 'selected' : ''}>Death</option>
                <option value="marriage" ${selectValue === 'marriage' ? 'selected' : ''}>Marriage</option>
                <option value="divorce" ${selectValue === 'divorce' ? 'selected' : ''}>Divorce</option>
                <option value="residence" ${selectValue === 'residence' ? 'selected' : ''}>Residence</option>
                <option value="burial" ${selectValue === 'burial' ? 'selected' : ''}>Burial</option>
                <option value="other" ${selectValue === 'other' ? 'selected' : ''}>Other…</option>
            </select>

            <input type="text" class="event-custom-type" placeholder="Enter custom event type"
                   value="${escapeHtml(customValue)}" style="display:${showCustom ? 'block' : 'none'}">

            <label>Date:</label>
            <input type="text" class="event-date" placeholder="YYYY-MM-DD or YYYY" 
                   value="${escapeHtml(eventData?.date?.value)}">

            <label>Date Qualifier:</label>
            <select class="event-date-qualifier">
                <option value="exact" ${eventData?.date?.qualifier === 'exact' ? 'selected' : ''}>Exact</option>
                <option value="about" ${eventData?.date?.qualifier === 'about' ? 'selected' : ''}>About</option>
                <option value="before" ${eventData?.date?.qualifier === 'before' ? 'selected' : ''}>Before</option>
                <option value="after" ${eventData?.date?.qualifier === 'after' ? 'selected' : ''}>After</option>
            </select>

            <label>Place:</label>
            <input type="text" class="event-place" placeholder="Location of event"
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
            if (!confirm('You have unsaved changes. Are you sure you want to create a new tree?')) {
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

        // Clear search results
        clearSearchResults();

        // Hide edit form
        hideEditForm();

        // Reinitialize Cytoscape with empty data
        initializeCytoscape();

        // Show success message
        editStatus.textContent = 'New family tree created!';
        editStatus.style.color = 'green';
        isDirty = false; // New tree starts clean
    }

    function handleSaveAsPdf() {
        if (!cy || (familyData.people.length === 0 && familyData.families.length === 0)) {
            alert("No data to export.");
            return;
        }

        // Create a new PDF document
        const pdf = new jsPDF('landscape');
        
        console.log("Font List:", pdf.getFontList());

        // Add title
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(20);
        pdf.text("Family Tree", 20, 20);
        
        // Add date
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(12);
        pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);
        
        // Export Cytoscape graph as image
        const pngDataUrl = cy.png({ full: true });
        
        // Add the graph image to the PDF
        pdf.addImage(pngDataUrl, 'PNG', 20, 40, 250, 150);
        
        // Add a new page for detailed information
        pdf.addPage();
        
        // Build family members table using shared helper
        const tableData = buildFamilyTableData();
        
        pdf.autoTable({
            startY: 20,
            head: [tableData[0]],
            body: tableData.slice(1),
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2, font: "times" },
            columnStyles: {
                0: { cellWidth: 30 },  // ID
                1: { cellWidth: 40 },  // Name
                2: { cellWidth: 15 },  // Gender
                3: { cellWidth: 30 },  // Birth
                4: { cellWidth: 30 },  // Death
                5: { cellWidth: 'wrap' },  // Parents
                6: { cellWidth: 50 },  // Spouses
                7: { cellWidth: 'wrap' }   // Children
            },
            tableWidth: 'wrap', // Ensure the table fits within the page
        });
        
        // Save the PDF
        pdf.save('family_tree.pdf');
    }

    function handleSaveAsSvg() {

        if (familyData.people.length === 0 && familyData.families.length === 0) {
            alert("No data to export.");
            return;
        }

        // Generate an SVG string for the entire graph
        // The options (e.g., scale) can be adjusted as needed.
        const svgContent = cy.svg({ scale: 1 });
        
        // Create a Blob from the SVG content
        const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
        
        
        // Create an object URL and trigger a download
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = 'FamilyTree.svg';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        
        // Clean up
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
    }

    function handleSaveAsHtml() {
        if (familyData.people.length === 0 && familyData.families.length === 0) {
            alert("No data to export.");
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
        <title>Family Tree</title>
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
            <button onclick="window.print()">Print</button>
        </div>
        <h1>Family Tree</h1>
        <div>${svgContent}</div>
        <table>
            <thead>
                <tr>
                    ${tableData[0].map(header => `<th>${header}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${tableData.slice(1).map(row => `
                    <tr>
                        ${row.map(cell => `<td>${cell}</td>`).join('')}
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
    // Strict Nuclear-Family SVG Tree (ported from Zupu_json2svg.py)
    // ================================================================

    function buildTreeSvg(data, clanSurname) {
        if (!clanSurname) clanSurname = '';

        const people = {};
        for (const p of (data.people || [])) people[p.id] = p;
        const families = {};
        for (const f of (data.families || [])) families[f.id] = f;

        // Build birth/death year lookup from events
        const events = data.events || [];
        const birthYear = {};
        const deathYear = {};
        for (const ev of events) {
            const pref = ev.personRef || '';
            const dateStr = (ev.date || {}).value || '';
            const yr = extractYear(dateStr);
            if (!yr || !pref) continue;
            if (ev.type === 'birth') birthYear[pref] = yr;
            else if (ev.type === 'death') deathYear[pref] = yr;
        }

        function birthName(person) {
            const names = person.names || [];
            const birth = names.find(n => n.type === 'birth') || names[0] || {};
            return [birth.surname || '', birth.given || ''];
        }

        function personLabel(person, pid) {
            const [s, g] = birthName(person);
            const nm = (s + g).trim() || pid;
            const gender = person.gender;
            if (gender === 'male') return '♂' + nm;
            if (gender === 'female') return '♀' + nm;
            return nm;
        }

        function svgEsc(text) {
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function extractYear(dateVal) {
            if (!dateVal) return '';
            return dateVal.replace(/\//g, '-').split('-')[0];
        }

        // 1) Find root ancestors
        let roots = [];
        for (const pid of Object.keys(people)) {
            const p = people[pid];
            if (!p.familiesAsChild || p.familiesAsChild.length === 0) {
                const [s] = birthName(p);
                if (s === clanSurname) roots.push(pid);
            }
        }
        if (roots.length === 0) {
            roots = Object.keys(people).filter(pid => {
                const p = people[pid];
                return !p.familiesAsChild || p.familiesAsChild.length === 0;
            });
        }

        // 2) Traverse descendants + spouses
        const includedPeople = new Set();
        const includedFamilies = new Set();
        const queue = [...roots];
        const seen = new Set();

        while (queue.length > 0) {
            const pid = queue.shift();
            if (seen.has(pid)) continue;
            seen.add(pid);
            includedPeople.add(pid);

            for (const fid of (people[pid] || {}).familiesAsSpouse || []) {
                if (!families[fid]) continue;
                includedFamilies.add(fid);
                const fam = families[fid];
                for (const sp of (fam.partners || [])) includedPeople.add(sp);
                for (const c of (fam.children || [])) {
                    includedPeople.add(c);
                    queue.push(c);
                }
            }

            for (const fid of (people[pid] || {}).familiesAsChild || []) {
                if (!families[fid]) continue;
                includedFamilies.add(fid);
                const fam = families[fid];
                for (const sp of (fam.partners || [])) {
                    if (!includedPeople.has(sp)) includedPeople.add(sp);
                }
                for (const c of (fam.children || [])) {
                    if (!includedPeople.has(c)) {
                        includedPeople.add(c);
                        queue.push(c);
                    }
                }
            }
        }

        // prune families
        const prunedFamilies = new Set();
        for (const fid of includedFamilies) {
            const fam = families[fid];
            const all = [...(fam.partners || []), ...(fam.children || [])];
            if (all.some(x => includedPeople.has(x))) prunedFamilies.add(fid);
        }
        const incFams = prunedFamilies;

        // spouse family index
        const spouseFamsOf = {};
        for (const fid of incFams) {
            for (const p of (families[fid].partners || [])) {
                if (includedPeople.has(p)) {
                    if (!spouseFamsOf[p]) spouseFamsOf[p] = [];
                    spouseFamsOf[p].push(fid);
                }
            }
        }

        // 3) Generation inference
        const gen = {};
        for (const p of includedPeople) gen[p] = 0;
        for (const r of roots) { if (r in gen) gen[r] = 0; }

        for (let iter = 0; iter < 100; iter++) {
            let changed = false;

            // spouses same generation
            for (const fid of incFams) {
                const partners = (families[fid].partners || []).filter(p => p in gen);
                if (partners.length >= 2) {
                    const gmax = Math.max(...partners.map(p => gen[p]));
                    for (const p of partners) {
                        if (gen[p] !== gmax) { gen[p] = gmax; changed = true; }
                    }
                }
            }

            // child >= parent + 1
            for (const fid of incFams) {
                const partners = (families[fid].partners || []).filter(p => p in gen);
                if (partners.length === 0) continue;
                const pg = Math.max(...partners.map(p => gen[p]));
                for (const c of (families[fid].children || [])) {
                    if (c in gen && gen[c] < pg + 1) { gen[c] = pg + 1; changed = true; }
                }
            }

            if (!changed) break;
        }

        // normalize
        const genVals = Object.values(gen);
        if (genVals.length > 0) {
            const gmin = Math.min(...genVals);
            if (gmin) { for (const p of Object.keys(gen)) gen[p] -= gmin; }
        }

        // 4) Primary descendant family per child
        const primaryDescFam = {};
        const childlessSpouseFam = {};
        for (const c of includedPeople) {
            const cFams = (spouseFamsOf[c] || []).filter(fid => (families[fid].children || []).length > 0);
            if (cFams.length > 0) {
                primaryDescFam[c] = cFams.sort()[0];
            } else {
                const cSpouseFams = (spouseFamsOf[c] || []).filter(fid =>
                    incFams.has(fid) && (families[fid].partners || []).length >= 2
                );
                if (cSpouseFams.length > 0) {
                    childlessSpouseFam[c] = cSpouseFams.sort()[0];
                }
            }
        }

        // 5) Recursive width for strict nuclear blocks
        const NODE_W = 44, NODE_H = 100;
        const PARTNER_GAP = 12;
        const CHILD_GAP = 24;
        const BLOCK_GAP = 34;
        const ROW_GAP = 86;
        const PAD = 36;
        const TITLE_H = 40;

        const subtreeW = {};
        const widthVisiting = new Set();

        function childSlotMinWidth(childId, parentFid) {
            let coupleW = NODE_W;
            for (const sfid of (spouseFamsOf[childId] || [])) {
                if (sfid === parentFid || !incFams.has(sfid)) continue;
                const sp = (families[sfid].partners || []).filter(p => includedPeople.has(p));
                const pw = sp.length * NODE_W + Math.max(0, sp.length - 1) * PARTNER_GAP;
                coupleW = Math.max(coupleW, pw);
            }
            return coupleW;
        }

        function familyWidth(fid) {
            if (fid in subtreeW) return subtreeW[fid];
            if (widthVisiting.has(fid)) { subtreeW[fid] = NODE_W; return NODE_W; }

            widthVisiting.add(fid);
            const fam = families[fid];
            const partners = (fam.partners || []).filter(p => includedPeople.has(p));
            const children = (fam.children || []).filter(c => includedPeople.has(c));

            const pw = partners.length * NODE_W + Math.max(0, partners.length - 1) * PARTNER_GAP;

            const slotWidths = [];
            for (const c of children) {
                const df = primaryDescFam[c];
                const minW = childSlotMinWidth(c, fid);
                if (df && df !== fid && incFams.has(df)) {
                    slotWidths.push(Math.max(minW, familyWidth(df)));
                } else {
                    slotWidths.push(minW);
                }
            }

            const cwTotal = slotWidths.reduce((a, b) => a + b, 0) + Math.max(0, slotWidths.length - 1) * CHILD_GAP;
            const w = Math.max(NODE_W, pw, cwTotal);
            subtreeW[fid] = w;
            return w;
        }

        // root families
        let rootFams = [];
        for (const fid of incFams) {
            if ((families[fid].partners || []).some(p => roots.includes(p))) {
                rootFams.push(fid);
            }
        }
        if (rootFams.length === 0) {
            for (const fid of incFams) {
                const partners = families[fid].partners || [];
                if (partners.some(p => !(people[p] || {}).familiesAsChild || (people[p] || {}).familiesAsChild.length === 0)) {
                    rootFams.push(fid);
                }
            }
        }
        rootFams = [...new Set(rootFams)].sort();
        for (const rf of rootFams) familyWidth(rf);

        // 6) Place families recursively
        const pos = {};
        const famMidBottom = {};

        function placeFamily(fid, x0, y0, guard) {
            if (!guard) guard = new Set();
            if (guard.has(fid)) return;
            guard = new Set(guard);
            guard.add(fid);

            const fam = families[fid];
            const partners = (fam.partners || []).filter(p => includedPeople.has(p));
            const children = (fam.children || []).filter(c => includedPeople.has(c));
            const totalW = subtreeW[fid] || NODE_W;

            // partners row centered
            const pw = partners.length * NODE_W + Math.max(0, partners.length - 1) * PARTNER_GAP;
            const px = x0 + (totalW - pw) / 2;
            const py = y0;

            for (let i = 0; i < partners.length; i++) {
                pos[partners[i]] = [px + i * (NODE_W + PARTNER_GAP), py];
            }

            let mx;
            if (partners.length > 0) {
                mx = (px + px + pw) / 2;
            } else {
                mx = x0 + totalW / 2;
            }
            famMidBottom[fid] = [mx, py + NODE_H];

            // children row
            const childY = y0 + NODE_H + ROW_GAP;

            const childSlots = [];
            for (const c of children) {
                const df = primaryDescFam[c];
                const minW = childSlotMinWidth(c, fid);
                let sw;
                if (df && df !== fid && incFams.has(df)) {
                    sw = Math.max(minW, subtreeW[df]);
                } else {
                    sw = minW;
                }
                childSlots.push([c, df, sw]);
            }

            const cwTotal = childSlots.reduce((acc, s) => acc + s[2], 0) + Math.max(0, childSlots.length - 1) * CHILD_GAP;
            let cx = x0 + (totalW - cwTotal) / 2;

            for (const [c, df, sw] of childSlots) {
                const childX = cx + (sw - NODE_W) / 2;
                pos[c] = [childX, childY];

                if (df && df !== fid && incFams.has(df) && !guard.has(df)) {
                    const dpartners = (families[df].partners || []).filter(p => includedPeople.has(p));
                    let idx = dpartners.indexOf(c);
                    if (idx < 0) idx = 0;

                    const dpw = dpartners.length * NODE_W + Math.max(0, dpartners.length - 1) * PARTNER_GAP;
                    const dtotal = subtreeW[df];
                    const dpx = (dtotal - dpw) / 2;
                    const targetX = dpx + idx * (NODE_W + PARTNER_GAP);

                    let descX0 = childX - targetX;
                    const slotLeft = cx;
                    const slotRight = cx + sw;
                    if (descX0 < slotLeft) descX0 = slotLeft;
                    if (descX0 + dtotal > slotRight) descX0 = slotRight - dtotal;

                    placeFamily(df, descX0, childY, guard);

                } else if (c in childlessSpouseFam) {
                    const csfid = childlessSpouseFam[c];
                    if (!(csfid in famMidBottom)) {
                        const cspartners = (families[csfid].partners || []).filter(p => includedPeople.has(p));
                        if (cspartners.includes(c)) {
                            const cpw = cspartners.length * NODE_W + Math.max(0, cspartners.length - 1) * PARTNER_GAP;
                            const cpx = cx + (sw - cpw) / 2;
                            for (let ci = 0; ci < cspartners.length; ci++) {
                                pos[cspartners[ci]] = [cpx + ci * (NODE_W + PARTNER_GAP), childY];
                            }
                            const left = cpx;
                            const right = cpx + cpw;
                            famMidBottom[csfid] = [(left + right) / 2, childY + NODE_H];
                        }
                    }
                }

                cx += sw + CHILD_GAP;
            }
        }

        // place root families side-by-side
        let xCursor = PAD;
        const yStart = PAD + TITLE_H;
        for (const rf of rootFams) {
            if (!(rf in famMidBottom)) {
                placeFamily(rf, xCursor, yStart);
                xCursor += subtreeW[rf] + BLOCK_GAP;
            }
        }

        if (Object.keys(pos).length === 0) {
            throw new Error('No nodes were positioned. Check JSON structure and surname scope.');
        }

        // 7) Build edges
        const marriageEdges = [];
        const parentGroups = [];
        const posPeople = new Set(Object.keys(pos));

        for (const fid of incFams) {
            const fam = families[fid];
            const partners = (fam.partners || []).filter(p => posPeople.has(p));
            const children = (fam.children || []).filter(c => posPeople.has(c));

            if (partners.length >= 2) {
                for (let i = 0; i < partners.length - 1; i++) {
                    marriageEdges.push([partners[i], partners[i + 1]]);
                }
            }

            if (fid in famMidBottom && children.length > 0) {
                const [fmx, fmy] = famMidBottom[fid];
                parentGroups.push([fmx, fmy, children]);
            }
        }

        // canvas size
        const allX = Object.values(pos).map(p => p[0]);
        const allY = Object.values(pos).map(p => p[1]);
        const W = Math.ceil(Math.max(...allX) + NODE_W + PAD);
        const H = Math.ceil(Math.max(...allY) + NODE_H + PAD);

        // 8) Emit SVG
        const svg = [];
        svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
        svg.push('<defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">' +
                 '<feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-opacity="0.16"/></filter></defs>');
        svg.push('<rect width="100%" height="100%" fill="white"/>');
        svg.push(`<text x="${PAD}" y="${PAD}" font-size="18" font-weight="700" ` +
                 `font-family="Arial, sans-serif">${svgEsc(clanSurname)}氏家族关系图（严格核心家庭分组）</text>`);

        // lines
        svg.push('<g stroke="#555" stroke-width="1.4" fill="none">');
        for (const [a, b] of marriageEdges) {
            const [ax, ay] = pos[a];
            const [bx, by] = pos[b];
            const yline = ay + NODE_H / 2;
            svg.push(`<line x1="${ax + NODE_W}" y1="${yline}" x2="${bx}" y2="${yline}"/>`);
        }

        for (const [fmx, fmy, children] of parentGroups) {
            const childTops = children.map(c => pos[c][1]);
            const jy = fmy + Math.max(20, (Math.min(...childTops) - fmy) * 0.52);
            svg.push(`<line x1="${fmx}" y1="${fmy}" x2="${fmx}" y2="${jy}"/>`);

            const centers = children.map(c => [pos[c][0] + NODE_W / 2, pos[c][1]]);
            const minCx = Math.min(...centers.map(c => c[0]));
            const maxCx = Math.max(...centers.map(c => c[0]));
            svg.push(`<line x1="${minCx}" y1="${jy}" x2="${maxCx}" y2="${jy}"/>`);

            for (const [ccx, ccy] of centers) {
                svg.push(`<line x1="${ccx}" y1="${jy}" x2="${ccx}" y2="${ccy}"/>`);
            }
        }
        svg.push('</g>');

        // nodes
        svg.push('<g font-family="Arial, sans-serif">');
        for (const pid of Object.keys(pos)) {
            const [x, y] = pos[pid];
            const p = people[pid];
            const gender = p.gender;
            let fill, stroke;
            if (gender === 'male') { fill = '#F2F6FF'; stroke = '#2F5AA8'; }
            else if (gender === 'female') { fill = '#FFF2F6'; stroke = '#A82F5A'; }
            else { fill = '#F7F7F7'; stroke = '#666'; }

            svg.push('<g filter="url(#shadow)">');
            svg.push(`<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="10" ry="10" ` +
                     `fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`);

            const txt = personLabel(p, pid);
            const chars = [...txt];
            const top = y + 18;
            const lineH = 16.5;

            const by = birthYear[pid] || '';
            const dy = deathYear[pid] || '';
            const yearLines = (by ? 1 : 0) + (dy ? 1 : 0);
            const yearBlockH = yearLines * 9;
            const availableH = NODE_H - 10 - yearBlockH;
            const maxLines = Math.floor(availableH / lineH);

            for (let i = 0; i < Math.min(chars.length, maxLines); i++) {
                svg.push(`<text x="${x + NODE_W / 2}" y="${top + i * lineH}" ` +
                         `text-anchor="middle" font-size="15" fill="#111">${svgEsc(chars[i])}</text>`);
            }

            let yearY = y + NODE_H - 4 - (yearLines - 1) * 9;
            if (by) {
                svg.push(`<text x="${x + NODE_W / 2}" y="${yearY}" ` +
                         `text-anchor="middle" font-size="7.5" fill="#888">b.${svgEsc(by)}</text>`);
                yearY += 9;
            }
            if (dy) {
                svg.push(`<text x="${x + NODE_W / 2}" y="${yearY}" ` +
                         `text-anchor="middle" font-size="7.5" fill="#888">d.${svgEsc(dy)}</text>`);
            }

            svg.push(`<text x="${x + NODE_W - 3}" y="${y + 10}" text-anchor="end" ` +
                     `font-size="8.5" fill="#666">G${(gen[pid] || 0) + 1}</text>`);
            svg.push('</g>');
        }
        svg.push('</g>');
        svg.push('</svg>');

        return svg.join('\n');
    }

    function handleSaveAsSvgTree() {
        if (familyData.people.length === 0) {
            alert('No data to export. Load a family tree first.');
            return;
        }

        // Determine clan surname: use the most common surname among root people (no parents)
        let surname = '';
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

        const inputSurname = prompt('Enter clan surname for root filtering:', surname);
        if (inputSurname === null) return; // cancelled
        surname = inputSurname || surname;

        try {
            const svgContent = buildTreeSvg(familyData, surname);

            // Open in a new window for preview + download
            const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            const newWindow = window.open('', '_blank');
            if (!newWindow) {
                alert('Pop-up blocked. Please allow pop-ups for this page.');
                URL.revokeObjectURL(url);
                return;
            }
            newWindow.document.open();
            newWindow.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(surname)}氏 Family Tree SVG</title>
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
  <button onclick="downloadSvg()">Download SVG</button>
  <span>Scroll to explore the tree</span>
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
            alert('Error generating SVG tree: ' + err.message);
            console.error(err);
        }
    }
    
}); // End DOMContentLoaded