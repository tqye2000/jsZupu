//----------------------------------------------------------------
// File i18n.js  –  Internationalisation helpers
//----------------------------------------------------------------
window.Zupu = window.Zupu || {};

window.Zupu.i18n = (function () {
    const translations = {
        zh: {
            title: '简易族谱', heading: '简易族谱',
            loadLabel: '加载族谱:', newTree: '新建',
            searchPlaceholder: '姓名查询...', search: '查询',
            save: '下载保存', addPerson: '添加新成员', print: '打印',
            svgTree: 'SVG族谱图', svgTreeTip: '生成严格核心家庭SVG族谱图',
            undo: '↩ 撤销', undoTip: '撤销 (Ctrl+Z)',
            fit: '⛶ 适应', fitTip: '适应屏幕',
            detailsEdit: '详情 / 编辑',
            selectPrompt: '(从关系图上或搜索结果中选择一人)',
            nameTypeLabel: '获取方式:', nameBirth: '出生', nameMarried: '结婚',
            nameAdopted: '领养', nameNickname: '其他',
            givenName: '名字:', surname: '姓:',
            addName: '添加其他名字',
            genderLabel: '性别:', genderSelect: '选择...',
            genderMale: '男', genderFemale: '女', genderOther: '其他',
            eventsHeading: '事件', addEvent: '添加事件',
            parentFamily: '父母家庭:', spouseFamily: '配偶家庭:',
            saveChanges: '保存', cancel: '取消',
            deletePerson: '删除此人', deleteConfirm: '确定要删除此人吗？此操作可以通过撤销恢复。',
        }
    };

    /** Detect the active language from env hints. */
    function detect() {
        const urlLang = new URLSearchParams(window.location.search).get('lang');
        return window.ZUPU_LANG || urlLang || document.documentElement.lang || 'en';
    }

    /** Apply translations to every element with data-i18n* attributes. Returns the translation map (or {}). */
    function apply(lang) {
        const t = translations[lang];
        if (!t) return {};
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) el.textContent = t[key];
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (t[key]) el.placeholder = t[key];
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (t[key]) el.title = t[key];
        });
        if (t.title) document.title = t.title;
        return t;
    }

    return { translations, detect, apply };
})();
