//----------------------------------------------------------------
// File app.js
//
// History:
// 2025-Apr-12: Initial version
//----------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // Initialize jsPDF
    window.jsPDF = window.jspdf.jsPDF;
        
    // --- Globals ---
    let familyData = { people: [], families: [], events: [], places: [], sources: [], notes: [], meta: {} };
    let cy; // Cytoscape instance
    let currentlyEditingPersonId = null;
    let currentFileName = null; // Track the currently loaded file name

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


    // --- Functions ---
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
            let displayName = person.id; // Fallback
            if (person.names && person.names.length > 0) {
                 const birthName = person.names.find(n => n.type === 'birth') || person.names[0];
                 const firstGiven = (birthName || person.names[0]).given || '';
                 const firstSurname = (birthName || person.names[0]).surname || '';
                 displayName = `${firstSurname} ${firstGiven}`.trim();
            }
             if (!displayName) displayName = person.id;
    
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
                {
                    selector: 'node',
                    style: {
                        'background-color': '#666',
                        'label': 'data(name)', // This now points to our multi-line label
                        'width': 100,      // Auto width
                        'height': 50,     // Auto height
                        'padding': 10,     // Increase padding slightly for multi-line
                        'shape': 'round-rectangle',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'color': 'white',
                        'font-size': '9px',   // Make font slightly smaller for more info
                        'text-wrap': 'wrap',   // ESSENTIAL for multi-line labels
                        'text-max-width': 100, // Max width before wrapping further
                        'line-height': 1.2   // Adjust line spacing
                    }
                },
                // ... (Keep other style rules: gender-specific colors, family nodes, edges, selected state) ...
                { // Style for specific gender (example)
                    selector: 'node[gender="female"]',
                    style: {
                        'background-color': '#ff69b4' // Pink
                    }
                },
                {
                    selector: 'node[gender="male"]',
                    style: {
                        'background-color': '#4682B4' // Steel Blue - a darker shade of blue. 
                                                      //or '#0066cc' // Another option - Royal Blue
                    }
                },
                { // Style hidden family nodes
                    selector: 'node[?isFamilyNode]',
                    style: {
                        'width': 5,
                        'height': 5,
                        'background-color': '#666',
                        'label': ''
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 2,
                        'line-color': '#666',
                        'target-arrow-shape': 'none',
                        'curve-style': 'bezier'
                    }
                },
                {
                    selector: '.partner-edge',
                    style: {
                        'line-color': '#FF69B4', // Pink color for spouse relationships
                        'line-style': 'solid',
                        'width': 3
                    }
                },
                {
                    selector: '.child-edge',
                    style: {
                        'line-color': '#666',
                        'target-arrow-shape': 'triangle',
                        'target-arrow-color': '#666',
                        'arrow-scale': 0.8
                    }
                },
                {
                    selector: ':selected',
                    style: {
                        'border-width': 3,
                        'border-color': '#f00'
                    }
                }
            ],
            layout: {
                name: 'dagre',
                rankDir: 'TB',
                spacingFactor: 1.3,
                rankSep: 100, // Increase vertical spacing between ranks
                nodeSep: 50,  // Increase horizontal spacing between nodes
                edgeSep: 50   // Increase spacing between edges
            },
            minZoom: 0.2,
            maxZoom: 3,
            wheelSensitivity: 0.2,  // Reduce this value to make zooming less sensitive (default is 1)
            zoomingEnabled: true,
            userZoomingEnabled: true
        });

        // --- Cytoscape Event Handlers ---
        cy.on('tap', 'node[!isFamilyNode]', (event) => { // Only react to taps on people nodes
            const nodeId = event.target.id();
            displayPersonDetails(nodeId);
            cy.$(':selected').unselect(); // Unselect previous
            event.target.select(); // Select the tapped node
        });

        // Optional: Pan and zoom controls
        // cy.panzoom({});
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
        const newId = `p_${Date.now()}`; // Simple unique ID generation
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
                const familyId = `f_${Date.now()}`; // Simple unique ID generation
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
            const eventType = eventElement.querySelector('.event-type').value;
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
        saveChangesButton.textContent = "Save Changes"; // Reset button text
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
                const primaryName = person.names.find(n => n.type === 'birth') || person.names[0];
                const displayName = `${primaryName.given || ''} ${primaryName.surname || ''}`.trim() || person.id;
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
                const partner = familyData.people.find(p => p.id === pid);
                if (!partner?.names?.length) return pid;
                const name = partner.names[0];
                return `${name.given || ''} ${name.surname || ''}`.trim() || pid;
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
            <input type="text" class="given-name" value="${nameData?.given || ''}"><br>
            <label>Surname:</label>
            <input type="text" class="surname" value="${nameData?.surname || ''}">
            <button type="button" class="remove-name-button">Remove</button>
        `;

        nameDiv.querySelector('.remove-name-button').addEventListener('click', () => {
            nameDiv.remove();
        });

        additionalNamesDiv.appendChild(nameDiv);
    }

    function addEventField(eventData = null) {
        const eventDiv = document.createElement('div');
        eventDiv.className = 'event-item';
        
        // Generate a unique event ID if this is a new event
        const eventId = eventData?.id || `e_${Date.now()}`;
        
        eventDiv.innerHTML = `
            <button type="button" class="remove-event-button">×</button>
            <input type="hidden" class="event-id" value="${eventId}">
            
            <label>Event Type:</label>
            <select class="event-type">
                <option value="birth" ${eventData?.type === 'birth' ? 'selected' : ''}>Birth</option>
                <option value="death" ${eventData?.type === 'death' ? 'selected' : ''}>Death</option>
                <option value="marriage" ${eventData?.type === 'marriage' ? 'selected' : ''}>Marriage</option>
                <option value="divorce" ${eventData?.type === 'divorce' ? 'selected' : ''}>Divorce</option>
                <option value="residence" ${eventData?.type === 'residence' ? 'selected' : ''}>Residence</option>
                <option value="burial" ${eventData?.type === 'burial' ? 'selected' : ''}>Burial</option>
                <option value="other" ${eventData?.type === 'other' ? 'selected' : ''}>Other</option>
            </select>

            <label>Date:</label>
            <input type="text" class="event-date" placeholder="YYYY-MM-DD or YYYY" 
                   value="${eventData?.date?.value || ''}">

            <label>Date Qualifier:</label>
            <select class="event-date-qualifier">
                <option value="exact" ${eventData?.date?.qualifier === 'exact' ? 'selected' : ''}>Exact</option>
                <option value="about" ${eventData?.date?.qualifier === 'about' ? 'selected' : ''}>About</option>
                <option value="before" ${eventData?.date?.qualifier === 'before' ? 'selected' : ''}>Before</option>
                <option value="after" ${eventData?.date?.qualifier === 'after' ? 'selected' : ''}>After</option>
            </select>

            <label>Place:</label>
            <input type="text" class="event-place" placeholder="Location of event"
                   value="${eventData?.placeRef || ''}">
        `;

        eventDiv.querySelector('.remove-event-button').addEventListener('click', () => {
            eventDiv.remove();
        });

        eventsContainer.appendChild(eventDiv);
    }

    function handleNewTree() {
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
    }

    // function handleSaveAsPdf() {

    //     const pdf = new jsPDF('landscape');
    
    //     // --- Add custom Unicode font ---
    //     // Replace 'notoSansBase64' with your actual Base64 string representation of the TTF file
    //     pdf.addFileToVFS("NotoSansSC-Regular.ttf", NotoSansSC);
    //     pdf.addFont("NotoSansSC-Regular.ttf", "NotoSansSC", "normal");
    //     pdf.setFont("NotoSansSC");
    
    //     // Add title using the custom font
    //     pdf.setFont("NotoSansSC", "bold");
    //     pdf.setFontSize(20);
    //     pdf.text("Family Tree", 20, 20);
    
    //     // Add date
    //     pdf.setFont("NotoSansSC", "normal");
    //     pdf.setFontSize(12);
    //     pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);
    
    //     // Export Cytoscape graph as image
    //     const pngDataUrl = cy.png({ full: true });
    
    //     // Add the graph image to the PDF
    //     pdf.addImage(pngDataUrl, 'PNG', 20, 40, 250, 150);
    
    //     // Add a new page for detailed information
    //     pdf.addPage();
    
    //     // Prepare family members table data
    //     const tableData = [
    //         ['ID', 'Name', 'Gender', 'Birth', 'Death', 'Parents', 'Spouses', 'Children']
    //     ];
    
    //     familyData.people.forEach(person => {
    //         const primaryName = person.names?.[0] || {};
    //         const displayName = `${primaryName.given || ''} ${primaryName.surname || ''}`.trim();
    //         const birthEvent = familyData.events.find(e => e.personRef === person.id && e.type === 'birth');
    //         const deathEvent = familyData.events.find(e => e.personRef === person.id && e.type === 'death');
    
    //         // Get parents
    //         const parentFamily = person.familiesAsChild?.[0] ? 
    //             familyData.families.find(f => f.id === person.familiesAsChild[0]) : null;
    //         const parents = parentFamily?.partners?.map(pid => {
    //             const parent = familyData.people.find(p => p.id === pid);
    //             const parentName = parent?.names?.[0];
    //             return parentName ? `${parentName.given || ''} ${parentName.surname || ''}`.trim() : pid;
    //         }).join(', ') || '';
    
    //         // Get spouses
    //         const spouseFamilies = person.familiesAsSpouse?.map(famId => {
    //             const family = familyData.families.find(f => f.id === famId);
    //             return family?.partners?.filter(pid => pid !== person.id).map(pid => {
    //                 const spouse = familyData.people.find(p => p.id === pid);
    //                 const spouseName = spouse?.names?.[0];
    //                 return spouseName ? `${spouseName.given || ''} ${spouseName.surname || ''}`.trim() : pid;
    //             }).join(', ');
    //         }).filter(Boolean).join('; ') || '';
    
    //         // Get children
    //         const children = person.familiesAsSpouse?.map(famId => {
    //             const family = familyData.families.find(f => f.id === famId);
    //             return family?.children?.map(cid => {
    //                 const child = familyData.people.find(p => p.id === cid);
    //                 const childName = child?.names?.[0];
    //                 return childName ? `${childName.given || ''} ${childName.surname || ''}`.trim() : cid;
    //             }).join(', ');
    //         }).filter(Boolean).join('; ') || '';
    
    //         tableData.push([
    //             person.id,
    //             displayName,
    //             person.gender || '',
    //             birthEvent?.date?.value || '',
    //             deathEvent?.date?.value || '',
    //             parents,
    //             spouseFamilies,
    //             children
    //         ]);
    //     });
    
    //     // Use autoTable plugin to create the table
    //     pdf.autoTable({
    //         startY: 20,
    //         head: [tableData[0]],
    //         body: tableData.slice(1),
    //         theme: 'grid',
    //         styles: { fontSize: 8, font: "NotoSansSC" },
    //         columnStyles: {
    //             0: { cellWidth: 30 },
    //             1: { cellWidth: 50 },
    //             2: { cellWidth: 20 },
    //             3: { cellWidth: 30 },
    //             4: { cellWidth: 30 },
    //             5: { cellWidth: 50 },
    //             6: { cellWidth: 50 },
    //             7: { cellWidth: 50 }
    //         }
    //     });
    
    //     // Save the PDF
    //     pdf.save('family_tree.pdf');
    // }
    
    function handleSaveAsPdf() {
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
        
        // Add family members table with relationships
        const tableData = [
            ['ID', 'Name', 'Gender', 'Birth', 'Death', 'Parents', 'Spouses', 'Children']
        ];
        
        familyData.people.forEach(person => {
            const primaryName = person.names?.[0] || {};
            const displayName = `${primaryName.given || ''} ${primaryName.surname || ''}`.trim();
            const birthEvent = familyData.events.find(e => e.personRef === person.id && e.type === 'birth');
            const deathEvent = familyData.events.find(e => e.personRef === person.id && e.type === 'death');
            
            // Get parents
            const parentFamily = person.familiesAsChild?.[0] ? 
                familyData.families.find(f => f.id === person.familiesAsChild[0]) : null;
            const parents = parentFamily?.partners?.map(pid => {
                const parent = familyData.people.find(p => p.id === pid);
                const parentName = parent?.names?.[0];
                return parentName ? `${parentName.given || ''} ${parentName.surname || ''}`.trim() : pid;
            }).join(', ') || '';
            
            // Get spouses
            const spouseFamilies = person.familiesAsSpouse?.map(famId => {
                const family = familyData.families.find(f => f.id === famId);
                return family?.partners?.filter(pid => pid !== person.id).map(pid => {
                    const spouse = familyData.people.find(p => p.id === pid);
                    const spouseName = spouse?.names?.[0];
                    return spouseName ? `${spouseName.given || ''} ${spouseName.surname || ''}`.trim() : pid;
                }).join(', ');
            }).filter(Boolean).join('; ') || '';
            
            // Get children
            const children = person.familiesAsSpouse?.map(famId => {
                const family = familyData.families.find(f => f.id === famId);
                return family?.children?.map(cid => {
                    const child = familyData.people.find(p => p.id === cid);
                    const childName = child?.names?.[0];
                    return childName ? `${childName.given || ''} ${childName.surname || ''}`.trim() : cid;
                }).join(', ');
            }).filter(Boolean).join('; ') || '';
            
            tableData.push([
                person.id,
                displayName,
                person.gender || '',
                birthEvent?.date?.value || '',
                deathEvent?.date?.value || '',
                parents,
                spouseFamilies,
                children
            ]);
        });
        
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
                5: { cellWidth: 50, cellWidth: 'wrap' },  // Parents
                6: { cellWidth: 50 },  // Spouses
                7: { cellWidth: 50, cellWidth: 'wrap' }   // Children
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
    
        // Generate table content
        const tableData = [
            ['ID', 'Name', 'Gender', 'Birth', 'Death', 'Parents', 'Spouses', 'Children']
        ];
    
        familyData.people.forEach(person => {
            const primaryName = person.names?.[0] || {};
            const displayName = `${primaryName.surname || ''} ${primaryName.given || ''}`.trim();
            const birthEvent = familyData.events.find(e => e.personRef === person.id && e.type === 'birth');
            const deathEvent = familyData.events.find(e => e.personRef === person.id && e.type === 'death');
    
            const parents = (person.familiesAsChild || [])
                .map(famId => {
                    const family = familyData.families.find(f => f.id === famId);
                    return family?.partners?.map(pid => {
                        const parent = familyData.people.find(p => p.id === pid);
                        const parentName = parent?.names?.[0];
                        return parentName ? `${parentName.surname || ''} ${parentName.given || ''}`.trim() : pid;
                    }).join(', ');
                }).join('; ') || '';
    
            const spouses = (person.familiesAsSpouse || [])
                .map(famId => {
                    const family = familyData.families.find(f => f.id === famId);
                    return family?.partners?.filter(pid => pid !== person.id).map(pid => {
                        const spouse = familyData.people.find(p => p.id === pid);
                        const spouseName = spouse?.names?.[0];
                        return spouseName ? `${spouseName.surname || ''} ${spouseName.given || ''}`.trim() : pid;
                    }).join(', ');
                }).join('; ') || '';
    
            const children = (person.familiesAsSpouse || [])
                .map(famId => {
                    const family = familyData.families.find(f => f.id === famId);
                    return family?.children?.map(cid => {
                        const child = familyData.people.find(p => p.id === cid);
                        const childName = child?.names?.[0];
                        return childName ? `${childName.surname || ''} ${childName.given || ''}`.trim() : cid;
                    }).join(', ');
                }).join('; ') || '';
    
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
    
        // // Create a Blob and trigger download
        // const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        // const url = URL.createObjectURL(blob);

        // // Open the HTML file in a new tab
        // window.open(url, '_blank');

        // // Create a download link
        // const downloadLink = document.createElement('a');
        // downloadLink.href = url;
        // downloadLink.download = 'FamilyTree.html';
        // document.body.appendChild(downloadLink);
        // downloadLink.click();
        // document.body.removeChild(downloadLink);

        // // Clean up the URL object
        // URL.revokeObjectURL(url);

        // Open the HTML content in a new browser window
        const newWindow = window.open('', '_blank');
        newWindow.document.open();
        newWindow.document.write(htmlContent);
        newWindow.document.close();
        newWindow.focus();
    }
    
}); // End DOMContentLoaded