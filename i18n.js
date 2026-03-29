//----------------------------------------------------------------
// File i18n.js  –  Internationalisation helpers
//----------------------------------------------------------------
window.Zupu = window.Zupu || {};

window.Zupu.i18n = (function () {
    let currentLang = 'en';

    const translations = {
        en: {
            // UI chrome
            title: 'Client-Side Family Tree', heading: 'Family Tree',
            loadLabel: 'Load Family Tree:', newTree: 'New Tree',
            searchPlaceholder: 'Search name, date, or place...', search: 'Search',
            save: 'Save', addPerson: 'Add New Person', print: 'Print',
            svgTree: 'SVG Tree', svgTreeTip: 'Generate strict nuclear-family SVG tree',
            svgRootLabel: 'SVG Root Family:',
            svgRootTip: 'Choose top-level family name for SVG root filtering',
            undo: '↩ Undo', undoTip: 'Undo last change (Ctrl+Z)',
            fit: '⛶ Fit', fitTip: 'Fit graph to screen',
            // Details panel
            detailsEdit: 'Details / Edit',
            selectPrompt: '(Select a person in the graph or search results)',
            // Name fields
            nameTypeLabel: 'Name Type:', nameBirth: 'Birth Name', nameMarried: 'Married Name',
            nameAdopted: 'Adopted Name', nameNickname: 'Nickname',
            givenName: 'Given Name:', surname: 'Surname:',
            addName: 'Add Additional Name', removeBtn: 'Remove',
            // Gender
            genderLabel: 'Gender:', genderSelect: 'Select gender...',
            genderMale: 'Male', genderFemale: 'Female', genderOther: 'Other',
            // Events form
            eventsHeading: 'Events', addEvent: 'Add Event',
            eventTypeLabel: 'Event Type:', dateLabel: 'Date:',
            dateQualifierLabel: 'Date Qualifier:', placeLabel: 'Place:',
            eventBirth: 'Birth', eventDeath: 'Death', eventMarriage: 'Marriage',
            eventDivorce: 'Divorce', eventResidence: 'Residence', eventBurial: 'Burial',
            eventOther: 'Other\u2026',
            dateExact: 'Exact', dateAbout: 'About', dateBefore: 'Before', dateAfter: 'After',
            customEventPlaceholder: 'Enter custom event type',
            datePlaceholder: 'YYYY-MM-DD or YYYY',
            placePlaceholder: 'Location of event',
            // Notes
            notesHeading: 'Notes', addNote: 'Add Note',
            notePlaceholder: 'Enter note text...',
            // Family selectors
            parentFamily: 'Parent Family:', spouseFamily: 'Spouse Family:',
            selectParentFamily: 'Select Parent Family...',
            selectSpouseFamily: 'Select/Create Spouse Family...',
            createNewFamily: 'Create New Family...',
            familyLabel: 'Family: {names}', familyLabelId: 'Family {id}',
            // Buttons
            saveChanges: 'Save Changes', cancel: 'Cancel',
            addPersonBtn: 'Add Person',
            deletePerson: 'Delete Person',
            // Alerts & status messages
            deleteConfirm: 'Are you sure you want to delete "{name}"? This can be undone with Ctrl+Z.',
            personDeleted: '"{name}" deleted.',
            fileTooLarge: 'File is too large ({size} MB). Maximum allowed is 5 MB.',
            invalidJsonFormat: "Invalid JSON format. Missing 'people' or 'families' array.",
            errorParsingJson: 'Error parsing JSON file: {error}',
            errorReadingFile: 'Error reading file: {error}',
            dataLoadedWarnings: 'Data loaded with warnings:',
            noDataToSave: 'No data to save.',
            enterFilename: 'Enter filename to save:',
            fileSavedAs: 'File "{name}" saved successfully!',
            fileSaved: 'File saved successfully!',
            errorSavingFile: 'Error saving file: {error}',
            noDataToExport: 'No data to export.',
            graphNotInitialized: 'Graph not initialized.',
            noDataToExportSvg: 'No data to export. Load a family tree first.',
            enterClanSurname: 'Enter clan surname for root filtering:',
            svgRootAuto: 'Auto (most common top-level surname)',
            svgRootSurnameOption: '{surname} ({count})',
            subtreeFromPerson: 'Build downstream tree from {name}? (OK = subtree, Cancel = full tree)',
            popupBlocked: 'Pop-up blocked. Please allow pop-ups for this page.',
            errorGeneratingSvg: 'Error generating SVG tree: {error}',
            unsavedChangesConfirm: 'You have unsaved changes. Are you sure you want to create a new tree?',
            newTreeCreated: 'New family tree created!',
            changesSaved: 'Changes saved!',
            errorNoName: 'Error: Please enter at least one name.',
            noResults: 'No results found.',
            clickToView: 'Click to view details for {name} ({id})',
            // Export
            familyTreeTitle: 'Family Tree',
            downloadSvgBtn: 'Download SVG',
            scrollToExplore: 'Scroll to explore the tree',
            svgWindowTitle: '{surname} Family Tree SVG',
            svgChartTitle: '{surname} Family Tree (Nuclear Family Layout)',
            // Table headers
            tableId: 'ID', tableName: 'Name', tableGender: 'Gender',
            tableBirth: 'Birth', tableDeath: 'Death',
            tableParents: 'Parents', tableSpouses: 'Spouses', tableChildren: 'Children',
        },
        zh: {
            // UI chrome
            title: '简易族谱', heading: '简易族谱',
            loadLabel: '加载族谱:', newTree: '新建',
            searchPlaceholder: '查询姓名、日期或地点...', search: '查询',
            save: '下载保存', addPerson: '添加新成员', print: '打印',
            svgTree: 'SVG族谱图', svgTreeTip: '生成严格核心家庭SVG族谱图',
            svgRootLabel: 'SVG根姓:',
            svgRootTip: '选择用于SVG根节点过滤的顶层姓氏',
            undo: '↩ 撤销', undoTip: '撤销 (Ctrl+Z)',
            fit: '⛶ 适应', fitTip: '适应屏幕',
            // Details panel
            detailsEdit: '详情 / 编辑',
            selectPrompt: '(从关系图上或搜索结果中选择一人)',
            // Name fields
            nameTypeLabel: '获取方式:', nameBirth: '出生', nameMarried: '结婚',
            nameAdopted: '领养', nameNickname: '其他',
            givenName: '名字:', surname: '姓:',
            addName: '添加其他名字', removeBtn: '移除',
            // Gender
            genderLabel: '性别:', genderSelect: '选择...',
            genderMale: '男', genderFemale: '女', genderOther: '其他',
            // Events form
            eventsHeading: '事件', addEvent: '添加事件',
            eventTypeLabel: '事件类型：', dateLabel: '日期：',
            dateQualifierLabel: '日期限定：', placeLabel: '地点：',
            eventBirth: '出生', eventDeath: '死亡', eventMarriage: '结婚',
            eventDivorce: '离婚', eventResidence: '居住', eventBurial: '安葬',
            eventOther: '其他\u2026',
            dateExact: '精确', dateAbout: '大约', dateBefore: '之前', dateAfter: '之后',
            customEventPlaceholder: '输入自定义事件类型',
            datePlaceholder: 'YYYY-MM-DD 或 YYYY',
            placePlaceholder: '事件地点',
            // Notes
            notesHeading: '备注', addNote: '添加备注',
            notePlaceholder: '输入备注内容...',
            // Family selectors
            parentFamily: '父母家庭:', spouseFamily: '配偶家庭:',
            selectParentFamily: '选择父母家庭...',
            selectSpouseFamily: '选择/新建配偶家庭...',
            createNewFamily: '新建家庭...',
            familyLabel: '家庭：{names}', familyLabelId: '家庭 {id}',
            // Buttons
            saveChanges: '保存', cancel: '取消',
            addPersonBtn: '添加',
            deletePerson: '删除此人',
            // Alerts & status messages
            deleteConfirm: '确定要删除「{name}」吗？可通过 Ctrl+Z 撤销。',
            personDeleted: '「{name}」已删除。',
            fileTooLarge: '文件过大（{size} MB）。最大允许 5 MB。',
            invalidJsonFormat: "JSON 格式无效。缺少 'people' 或 'families' 数组。",
            errorParsingJson: '解析 JSON 文件出错：{error}',
            errorReadingFile: '读取文件出错：{error}',
            dataLoadedWarnings: '数据已加载，但有以下警告：',
            noDataToSave: '没有数据可保存。',
            enterFilename: '请输入保存文件名：',
            fileSavedAs: '文件「{name}」保存成功！',
            fileSaved: '文件保存成功！',
            errorSavingFile: '保存文件出错：{error}',
            noDataToExport: '没有数据可导出。',
            graphNotInitialized: '关系图尚未初始化。',
            noDataToExportSvg: '没有数据可导出，请先加载族谱。',
            enterClanSurname: '请输入族姓用于根节点过滤：',
            svgRootAuto: '自动（最常见顶层姓氏）',
            svgRootSurnameOption: '{surname}（{count}）',
            subtreeFromPerson: '是否从「{name}」开始生成下游族谱？（确定 = 子树，取消 = 完整族谱）',
            popupBlocked: '弹窗被拦截，请允许此页面弹出窗口。',
            errorGeneratingSvg: '生成SVG族谱图出错：{error}',
            unsavedChangesConfirm: '您有未保存的更改。确定要新建族谱吗？',
            newTreeCreated: '新族谱已创建！',
            changesSaved: '更改已保存！',
            errorNoName: '错误：请至少输入一个名字。',
            noResults: '未找到结果。',
            clickToView: '点击查看 {name}（{id}）的详情',
            // Export
            familyTreeTitle: '族谱',
            downloadSvgBtn: '下载SVG',
            scrollToExplore: '滚动浏览族谱',
            svgWindowTitle: '{surname}氏族谱SVG',
            svgChartTitle: '{surname}氏家族关系图（严格核心家庭分组）',
            // Table headers
            tableId: 'ID', tableName: '姓名', tableGender: '性别',
            tableBirth: '出生', tableDeath: '死亡',
            tableParents: '父母', tableSpouses: '配偶', tableChildren: '子女',
        }
    };

    /** Detect the active language from env hints. */
    function detect() {
        const urlLang = new URLSearchParams(window.location.search).get('lang');
        return window.ZUPU_LANG || urlLang || document.documentElement.lang || 'en';
    }

    /** Look up a translation key, substituting {param} placeholders. */
    function t(key, params) {
        const map = translations[currentLang] || {};
        const fallback = translations.en || {};
        const str = map[key] || fallback[key] || key;
        if (!params) return str;
        return str.replace(/\{(\w+)\}/g, (_, k) => (k in params) ? params[k] : '{' + k + '}');
    }

    /** Apply translations to every element with data-i18n* attributes. Returns the translation map (or {}). */
    function apply(lang) {
        currentLang = lang;
        const map = translations[lang];
        if (!map) return {};
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (map[key]) el.textContent = map[key];
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (map[key]) el.placeholder = map[key];
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (map[key]) el.title = map[key];
        });
        if (map.title) document.title = map.title;
        return map;
    }

    return { translations, detect, apply, t };
})();
