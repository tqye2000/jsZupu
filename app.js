//----------------------------------------------------------------
// File app.js
//
//
//----------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // --- Globals ---
    let familyData = { people: [], families: [], events: [], places: [], sources: [], notes: [], meta: {} };
    let cy; // Cytoscape instance
    let currentlyEditingPersonId = null;

    // --- DOM References ---
    const fileInput = document.getElementById('fileInput');
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const saveButton = document.getElementById('saveButton');
    const addPersonButton = document.getElementById('addPersonButton');
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
    saveChangesButton.addEventListener('click', handleSaveChanges);
    cancelEditButton.addEventListener('click', hideEditForm);


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
                 displayName = `${firstGiven} ${firstSurname}`.trim();
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

        // Find primary name for display in form
        let givenName = '';
        let surname = '';
        if (person.names && person.names.length > 0) {
             const birthName = person.names.find(n => n.type === 'birth') || person.names[0];
             givenName = birthName.given || '';
             surname = birthName.surname || '';
        }

        personIdInput.value = person.id;
        personGivenNameInput.value = givenName;
        personSurnameInput.value = surname;
        personGenderInput.value = person.gender || ''; // Will match one of the select options
        
        // Update family selectors
        updateFamilySelectors(person);
        
        detailsPanel.querySelector('h2').textContent = `Details / Edit: ${givenName} ${surname}`;
        detailsPanel.querySelector('p').classList.add('hidden');
        editForm.classList.remove('hidden');
        editStatus.textContent = '';
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
        const givenName = personGivenNameInput.value.trim();
        const surname = personSurnameInput.value.trim();
        const gender = personGenderInput.value; // No need to trim() for select values

        if (!personId) return;

        // Validate required fields
        if (!givenName && !surname) {
            editStatus.textContent = 'Error: Please enter at least a given name or surname.';
            editStatus.style.color = 'red';
            return;
        }

        if (!gender) {
            editStatus.textContent = 'Error: Please select a gender.';
            editStatus.style.color = 'red';
            return;
        }

        let person = familyData.people.find(p => p.id === personId);
        let isNewPerson = false;

        if (!person) {
            // This is a new person being added
            person = {
                id: personId,
                names: [], // Initialize names array
                gender: gender,
                // Initialize other fields as needed
                 eventRefs: [],
                 familiesAsSpouse: [],
                 familiesAsChild: [],
                 noteRefs: []
            };
            familyData.people.push(person);
            isNewPerson = true;
        }

        // Update/Set the primary name (assuming birth or first name for simplicity)
         let primaryName = person.names.find(n => n.type === 'birth');
         if (!primaryName && person.names.length > 0) {
            primaryName = person.names[0]; // Fallback to first name if no birth name
         }

         if (primaryName) {
             primaryName.given = givenName;
             primaryName.surname = surname;
         } else {
             // If no name exists yet, add one (likely for a new person)
            person.names.push({ type: 'birth', given: givenName, surname: surname });
         }

        // Update gender
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
        detailsPanel.querySelector('h2').textContent = `Details / Edit: ${givenName} ${surname}`; // Update panel title

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
            // Suggest a filename
            const defaultFilename = "family_tree_export.json";
            const currentFilename = fileInput.files[0]?.name; // Get original filename if available
            a.download = currentFilename || defaultFilename;

            document.body.appendChild(a); // Append link to body
            a.click(); // Programmatically click the link to trigger download

            document.body.removeChild(a); // Remove the link
            URL.revokeObjectURL(url); // Release the object URL
            editStatus.textContent = 'File saved successfully!';
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

}); // End DOMContentLoaded