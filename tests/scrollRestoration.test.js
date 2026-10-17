const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const commonScript = fs.readFileSync(path.join(__dirname, '../public/js/common.js'), 'utf8');

function createPage({
    historyState = null,
    navigationType = 'navigate',
    sessionStorage = new Map(),
    localStorage = new Map(),
    selects = [],
    pathname = '/customers',
    search = '',
} = {}) {
    const listeners = new Map();
    const documentListeners = new Map();
    const location = { href: `http://localhost${pathname}${search}`, pathname, search, hash: '', origin: 'http://localhost' };
    const history = {
        state: historyState,
        scrollRestoration: 'auto',
        replaceState(state, title, url) {
            this.state = state;
            if (url) {
                const parsedUrl = new URL(url, 'http://localhost');
                Object.assign(location, {
                    href: parsedUrl.href,
                    pathname: parsedUrl.pathname,
                    search: parsedUrl.search,
                    hash: parsedUrl.hash,
                });
            }
        },
        pushState(state) {
            this.state = state;
        },
    };
    const window = {
        history,
        location,
        performance: { getEntriesByType: () => [{ type: navigationType }] },
        sessionStorage: {
            getItem: key => sessionStorage.get(key) ?? null,
            setItem: (key, value) => sessionStorage.set(key, value),
        },
        localStorage: {
            getItem: key => localStorage.get(key) ?? null,
            setItem: (key, value) => localStorage.set(key, value),
        },
        scrollX: 0,
        scrollY: 0,
        scrollTo(x, y) {
            this.scrollX = x;
            this.scrollY = y;
        },
        addEventListener(type, listener) {
            listeners.set(type, listener);
        },
        requestAnimationFrame(callback) {
            callback();
            return 1;
        },
        setTimeout,
        fetch: () => Promise.resolve({ ok: true }),
    };
    const document = {
        title: 'Test',
        cookie: '',
        addEventListener(type, listener) {
            documentListeners.set(type, listener);
        },
        querySelectorAll: () => [],
        getElementById: id => selects.find(select => select.id === id),
    };
    window.dispatchEvent = (event) => {
        if (event.bubbles) listeners.get(event.type)?.(event);
    };
    window.Event = class {
        constructor(type, options) {
            this.type = type;
            this.bubbles = options?.bubbles || false;
        }
    };
    document.querySelectorAll = selector => selector === 'select[data-persist-filter][id]' ? selects : [];

    vm.runInNewContext(commonScript, {
        window,
        document,
        URL,
        console,
        Math,
        Date,
        Promise,
        Number,
        JSON,
        Set,
        Map,
        URLSearchParams,
        Event: window.Event,
    });

    return { window, history, listeners, documentListeners, sessionStorage, localStorage, selects };
}

test('scroll position is restored when returning to a previous page entry', async () => {
    const sessionStorage = new Map();
    const firstPage = createPage({ sessionStorage });
    const firstEntryState = firstPage.history.state;

    firstPage.window.scrollX = 12;
    firstPage.window.scrollY = 640;
    firstPage.listeners.get('scroll')();
    firstPage.listeners.get('pagehide')();

    const returnedPage = createPage({
        historyState: firstEntryState,
        navigationType: 'back_forward',
        sessionStorage,
    });
    returnedPage.listeners.get('pageshow')({ persisted: false });
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(returnedPage.window.history.scrollRestoration, 'manual');
    assert.equal(returnedPage.window.scrollX, 12);
    assert.equal(returnedPage.window.scrollY, 640);
});

test('each same-page history entry gets its own saved scroll position', async () => {
    const page = createPage();
    const firstEntryState = page.history.state;
    page.window.scrollY = 320;
    page.listeners.get('scroll')();
    page.history.pushState('', '', '/customers?page=2');
    const secondEntryState = page.history.state;

    assert.notEqual(secondEntryState.__sunny420xScrollKey, firstEntryState.__sunny420xScrollKey);

    page.window.scrollY = 0;
    page.listeners.get('popstate')({ state: firstEntryState });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(page.window.scrollY, 320);
});

test('filter select values are saved and restored for their history entry', async () => {
    const sessionStorage = new Map();
    const originalFilter = {
        id: 'search_by_type',
        value: 'all',
        multiple: false,
        matches: selector => selector === 'select[data-persist-filter][id]',
    };
    const firstPage = createPage({ sessionStorage, selects: [originalFilter] });
    const firstEntryState = firstPage.history.state;

    originalFilter.value = '4';
    firstPage.listeners.get('change')({ target: originalFilter });
    firstPage.listeners.get('pagehide')();

    const returnedFilter = {
        id: 'search_by_type',
        value: 'all',
        multiple: false,
        matches: selector => selector === 'select[data-persist-filter][id]',
        dispatchEvent(event) {
            if (event.type === 'change') returnedPage.listeners.get('change')({ target: returnedFilter });
        },
    };
    const returnedPage = createPage({
        historyState: firstEntryState,
        navigationType: 'back_forward',
        sessionStorage,
        selects: [returnedFilter],
    });
    returnedPage.listeners.get('pageshow')({ persisted: false });
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(returnedFilter.value, '4');
});

test('SPA filter changes preserve the old filter on the previous history entry', () => {
    const sessionStorage = new Map();
    const filter = {
        id: 'search_by_type',
        value: 'all',
        multiple: false,
        matches: selector => selector === 'select[data-persist-filter][id]',
    };
    const page = createPage({ sessionStorage, selects: [filter] });
    const firstEntryKey = page.history.state.__sunny420xScrollKey;

    filter.value = '8';
    page.listeners.get('change')({ target: filter });
    page.history.pushState('', '', '/products_stock?type=8');

    const previousEntry = JSON.parse(sessionStorage.get(`sunny420x-filters:${firstEntryKey}`));
    const currentEntry = JSON.parse(sessionStorage.get(`sunny420x-filters:${page.history.state.__sunny420xScrollKey}`));
    assert.deepEqual(previousEntry, [['search_by_type', 'all']]);
    assert.deepEqual(currentEntry, [['search_by_type', '8']]);
});

test('route filters are restored when returning through a menu link without query parameters', () => {
    const localStorage = new Map();
    const makeFilter = (id, value, queryParam) => ({
        id,
        value,
        multiple: false,
        dataset: { queryParam },
        matches: selector => selector === 'select[data-persist-filter][id]',
        dispatchEvent(event) {
            if (event.type === 'change') page.listeners.get('change')({ target: this });
        },
    });
    let page;
    const initialFilters = [
        makeFilter('search_by_type', 'all', 'type'),
        makeFilter('product_view_mode', 'list', 'option'),
    ];
    page = createPage({ localStorage, selects: initialFilters, pathname: '/products_stock' });
    initialFilters[0].value = '7';
    page.listeners.get('change')({ target: initialFilters[0] });
    page.listeners.get('pagehide')();

    const returnedFilters = [
        makeFilter('search_by_type', 'all', 'type'),
        makeFilter('product_view_mode', 'list', 'option'),
    ];
    page = createPage({ localStorage, selects: returnedFilters, pathname: '/products_stock' });
    page.documentListeners.get('DOMContentLoaded')();

    assert.deepEqual(returnedFilters.map(({ value }) => value), ['7', 'list']);
    assert.equal(new URLSearchParams(page.window.location.search).get('type'), '7');
    assert.equal(new URLSearchParams(page.window.location.search).get('option'), 'list');
});
