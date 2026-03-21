//----------------------------------------------------------------
// File graph.js  –  Cytoscape.js graph factory
//----------------------------------------------------------------
window.Zupu = window.Zupu || {};

/**
 * Create and return a configured Cytoscape.js instance for the family tree.
 *
 * @param {HTMLElement} container   - The DOM element to render into
 * @param {object}      familyData  - { people, families, events, … }
 * @param {object}      opts
 * @param {function}    opts.getDisplayName    - (person) => string
 * @param {function}    opts.getPersonLifespan - (personId) => string
 * @param {function}    [opts.onNodeTap]       - (personId) => void
 * @returns {object} The Cytoscape instance
 */
window.Zupu.createGraph = function (container, familyData, opts) {
    const { getDisplayName, getPersonLifespan, onNodeTap } = opts || {};

    const elements = [];

    // --- Person nodes ---
    familyData.people.forEach(person => {
        const displayName = getDisplayName ? getDisplayName(person) : person.id;
        const gender = person.gender ? person.gender.charAt(0).toUpperCase() : '';
        const lifespan = getPersonLifespan ? getPersonLifespan(person.id) : '';

        let fullLabel = displayName;
        if (gender) fullLabel += `\n[${gender}]`;
        if (lifespan) fullLabel += `\n${lifespan}`;

        elements.push({
            group: 'nodes',
            data: {
                id: person.id,
                name: fullLabel,
                gender: person.gender || 'unknown',
            }
        });
    });

    // --- Family junction nodes + edges ---
    familyData.families.forEach(family => {
        const partners = family.partners || [];
        const children = family.children || [];
        const familyNodeId = `fnode_${family.id}`;

        if (partners.length > 0) {
            elements.push({
                group: 'nodes',
                data: { id: familyNodeId, isFamilyNode: true }
            });

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

    // --- Create Cytoscape instance ---
    const cy = cytoscape({
        container: container,
        elements: elements,
        style: [
            // Person nodes (default)
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
            // Male nodes
            {
                selector: 'node[gender="male"]',
                style: {
                    'background-color': '#3A7BD5',
                    'border-color': '#2A5BA0',
                    'shape': 'round-rectangle',
                }
            },
            // Female nodes
            {
                selector: 'node[gender="female"]',
                style: {
                    'background-color': '#D5538A',
                    'border-color': '#A03A6A',
                    'shape': 'round-rectangle',
                }
            },
            // Family junction nodes
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
            // Default edge
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#999',
                    'target-arrow-shape': 'none',
                    'curve-style': 'taxi',
                    'taxi-direction': 'downward',
                    'taxi-turn': '50%',
                }
            },
            // Partner (spouse) edges
            {
                selector: '.partner-edge',
                style: {
                    'line-color': '#E8963A',
                    'line-style': 'solid',
                    'width': 2.5,
                    'curve-style': 'straight',
                }
            },
            // Parent → child edges
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
            // Selected node highlight
            {
                selector: ':selected',
                style: {
                    'border-width': 4,
                    'border-color': '#FFD600',
                    'background-blacken': -0.15,
                }
            },
            // Hover effect for person nodes
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
            rankSep: 120,
            nodeSep: 60,
            edgeSep: 30,
            ranker: 'tight-tree',
        },
        minZoom: 0.1,
        maxZoom: 4,
        wheelSensitivity: 0.3,
        zoomingEnabled: true,
        userZoomingEnabled: true,
        boxSelectionEnabled: false,
    });

    // --- Event handlers ---
    if (onNodeTap) {
        cy.on('tap', 'node[!isFamilyNode]', (event) => {
            const nodeId = event.target.id();
            onNodeTap(nodeId);
            cy.$(':selected').unselect();
            event.target.select();
        });
    }

    cy.on('layoutstop', () => {
        cy.fit(cy.elements(), 40);
    });

    return cy;
};
