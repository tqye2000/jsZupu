//----------------------------------------------------------------
// File utils.js  –  Pure utility helpers (no app state dependency)
//----------------------------------------------------------------
window.Zupu = window.Zupu || {};

window.Zupu.utils = (function () {
    let _idCounter = 0;

    /** Generate a unique ID with a given prefix, safe from millisecond collisions. */
    function generateId(prefix = 'id') {
        _idCounter++;
        return `${prefix}_${Date.now()}_${_idCounter}`;
    }

    /** Escape a string for safe insertion into HTML. Prevents XSS. */
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
     * @param {string} [order='surname-first'] - 'surname-first' or 'given-first'
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
     * Format a lifespan string such as "(1900 - 1970)" from a person's events.
     * @param {string} personId
     * @param {Map} eventsByPerson - Map of pid -> [event, ...]
     * @returns {string}
     */
    function getPersonLifespan(personId, eventsByPerson) {
        const personEvents = eventsByPerson.get(personId) || [];
        if (personEvents.length === 0) return '';

        let birthYear = null;
        let deathYear = null;

        const birthEvent = personEvents.find(e => e.type === 'birth' && e.date?.value);
        const deathEvent = personEvents.find(e => e.type === 'death' && e.date?.value);

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
        }
        return '';
    }

    return { generateId, escapeHtml, getDisplayName, getPersonLifespan };
})();
