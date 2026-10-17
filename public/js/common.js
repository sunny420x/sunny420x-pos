(() => {
    const scrollStateKey = '__sunny420xScrollKey';
    const storagePrefix = 'sunny420x-scroll:';
    const filterStoragePrefix = 'sunny420x-filters:';
    const routeFilterStoragePrefix = 'sunny420x-route-filters:';
    const pendingFetches = new Set();
    let scrollKey;
    let lastFilters = [];
    let saveScheduled = false;
    let storageWarningShown = false;

    const createScrollKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const stateWithScrollKey = (state, key) => {
        if (state && typeof state === 'object') return { ...state, [scrollStateKey]: key };
        return { [scrollStateKey]: key, __sunny420xOriginalHistoryState: state };
    };
    const reportStorageError = error => {
        if (storageWarningShown) return;
        storageWarningShown = true;
        console.warn('Page state could not be saved to browser storage:', error);
    };
    const currentScrollKey = () => {
        const key = window.history.state?.[scrollStateKey];
        return typeof key === 'string' ? key : scrollKey;
    };
    const getPersistedFilters = () => [...document.querySelectorAll('select[data-persist-filter][id]')]
        .filter(select => !select.multiple)
        .map(select => [select.id, select.value]);
    const routeFilterStorageKey = () => `${routeFilterStoragePrefix}${window.location.pathname}`;
    const saveRouteFilterValues = filters => {
        try {
            window.localStorage.setItem(routeFilterStorageKey(), JSON.stringify(filters));
        } catch (error) {
            reportStorageError(error);
        }
    };
    const updateFilterQuery = filters => {
        const params = new URLSearchParams(window.location.search);
        filters.forEach(([id, value]) => {
            const select = document.getElementById(id);
            const param = select?.dataset.queryParam;
            if (param && typeof value === 'string') params.set(param, value);
        });
        if (!params.has('page')) params.set('page', '1');
        const query = params.toString();
        const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
        window.history.replaceState(window.history.state, document.title, nextUrl);
    };
    const restoreRouteFilters = () => {
        let savedFilters;
        try {
            const stored = window.localStorage.getItem(routeFilterStorageKey());
            if (stored) savedFilters = JSON.parse(stored);
        } catch (error) {
            reportStorageError(error);
            return;
        }
        if (!Array.isArray(savedFilters)) {
            lastFilters = getPersistedFilters();
            saveRouteFilterValues(lastFilters);
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const controls = new Map(
            [...document.querySelectorAll('select[data-persist-filter][id]')]
                .filter(select => !select.multiple)
                .map(select => [select.id, select])
        );
        let restoredAny = false;
        window.__sunny420xRestoringFilters = true;
        try {
            savedFilters.forEach(([id, value]) => {
                const select = controls.get(id);
                const param = select?.dataset.queryParam;
                if (!select || typeof value !== 'string' || (param && params.has(param))) return;
                if (select.value !== value) {
                    select.value = value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (param) params.set(param, value);
                restoredAny = true;
            });
        } finally {
            window.__sunny420xRestoringFilters = false;
        }

        lastFilters = getPersistedFilters();
        if (restoredAny) {
            if (!params.has('page')) params.set('page', '1');
            const query = params.toString();
            const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
            window.history.replaceState(window.history.state, document.title, nextUrl);
        }
        saveRouteFilterValues(lastFilters);
    };
    const saveFilterValues = (filters = getPersistedFilters(), key = currentScrollKey()) => {
        if (!key) return;

        try {
            window.sessionStorage.setItem(`${filterStoragePrefix}${key}`, JSON.stringify(filters));
        } catch (error) {
            reportStorageError(error);
        }
    };
    const saveScrollPosition = () => {
        const key = currentScrollKey();
        if (!key) return;

        try {
            window.sessionStorage.setItem(`${storagePrefix}${key}`, JSON.stringify({
                x: window.scrollX,
                y: window.scrollY,
            }));
        } catch (error) {
            reportStorageError(error);
        }
    };
    const restorePageState = async key => {
        if (typeof key !== 'string') return;

        let position;
        let filters;
        try {
            const savedPosition = window.sessionStorage.getItem(`${storagePrefix}${key}`);
            if (savedPosition) position = JSON.parse(savedPosition);
            const savedFilters = window.sessionStorage.getItem(`${filterStoragePrefix}${key}`);
            if (savedFilters) filters = JSON.parse(savedFilters);
        } catch (error) {
            reportStorageError(error);
            return;
        }

        if (Array.isArray(filters)) {
            const controls = new Map(
                [...document.querySelectorAll('select[data-persist-filter][id]')]
                    .filter(select => !select.multiple)
                    .map(select => [select.id, select])
            );
            lastFilters = filters;
            window.__sunny420xRestoringFilters = true;
            try {
                filters.forEach(([id, value]) => {
                    const select = controls.get(id);
                    if (!select || typeof value !== 'string' || select.value === value) return;
                    select.value = value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                });
            } finally {
                window.__sunny420xRestoringFilters = false;
            }
        } else {
            lastFilters = getPersistedFilters();
        }

        if (pendingFetches.size) {
            await Promise.race([
                Promise.allSettled([...pendingFetches]),
                new Promise(resolve => window.setTimeout(resolve, 1500)),
            ]);
        }
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
        await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
        window.scrollTo(position.x, position.y);
    };

    scrollKey = window.history.state?.[scrollStateKey];
    if (typeof scrollKey !== 'string') {
        scrollKey = createScrollKey();
        window.history.replaceState(stateWithScrollKey(window.history.state, scrollKey), document.title);
    }
    lastFilters = getPersistedFilters();
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

    const originalPushState = window.history.pushState.bind(window.history);
    window.history.pushState = (state, title, url) => {
        saveScrollPosition();
        saveFilterValues(lastFilters);
        scrollKey = createScrollKey();
        const result = originalPushState(stateWithScrollKey(state, scrollKey), title, url);
        lastFilters = getPersistedFilters();
        saveFilterValues(lastFilters, scrollKey);
        return result;
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = (...args) => {
        const request = originalFetch(...args);
        pendingFetches.add(request);
        request.then(
            () => pendingFetches.delete(request),
            () => pendingFetches.delete(request)
        );
        return request;
    };

    window.addEventListener('scroll', () => {
        if (saveScheduled) return;
        saveScheduled = true;
        window.requestAnimationFrame(() => {
            saveScheduled = false;
            saveScrollPosition();
        });
    }, { passive: true });
    window.addEventListener('change', event => {
        if (!event.target.matches?.('select[data-persist-filter][id]')) return;
        const currentFilters = getPersistedFilters();
        if (window.__sunny420xRestoringFilters) {
            lastFilters = currentFilters;
            return;
        }
        saveFilterValues(lastFilters);
        saveRouteFilterValues(currentFilters);
    });
    window.addEventListener('pagehide', () => {
        saveScrollPosition();
        saveFilterValues();
        saveRouteFilterValues(getPersistedFilters());
    });
    document.addEventListener('DOMContentLoaded', restoreRouteFilters);
    window.addEventListener('popstate', event => {
        scrollKey = event.state?.[scrollStateKey];
        restorePageState(scrollKey);
    });
    window.addEventListener('pageshow', event => {
        const navigation = window.performance.getEntriesByType('navigation')[0];
        if (event.persisted || navigation?.type === 'back_forward') {
            restorePageState(currentScrollKey());
        }
    });
})();

function openLink(url) {
    window.location.href = url
}

function newTab(url) {
    window.open(url, '_blank');
}

function getCookie(cname) {
    let name = cname + "=";
    let decodedCookie = decodeURIComponent(document.cookie);
    let ca = decodedCookie.split(';');
    for(let i = 0; i <ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) == ' ') {
        c = c.substring(1);
      }
      if (c.indexOf(name) == 0) {
        return c.substring(name.length, c.length);
      }
    }
    return "";
}

function eraseCookie(name) {   
    document.cookie = name + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
}

const alert_cookie = getCookie('alert')

if(alert_cookie != undefined) {
    eraseCookie('alert')
    switch(alert_cookie) {
        case "success":
            Swal.fire({
                title: 'บันทึกการเปลี่ยนแปลงแล้ว!',
                icon: 'success',
                confirmButtonText: 'รับทราบ'
            })
            break
        case "addSuccess":
            Swal.fire({
                title: 'เพิ่มข้อมูลแล้ว!',
                icon: 'success',
                confirmButtonText: 'รับทราบ'
            })
            break        
        case "deleteSuccess":
            Swal.fire({
                title: 'ลบข้อมูลแล้ว!',
                icon: 'success',
                confirmButtonText: 'รับทราบ'
            })
            break
        case "logoutSuccess":
            Swal.fire({
                title: 'ออกจากระบบแล้ว!',
                icon: 'success',
                confirmButtonText: 'รับทราบ'
            })
            break
        case "wrongPassword":
            Swal.fire({
                title: 'ข้อมูลการเข้าสู่ระบบไม่ถูกต้อง!',
                icon: 'error',
                confirmButtonText: 'รับทราบ'
            })
            break
        case "NoData":
            Swal.fire({
                title: 'ไม่มีข้อมูลดังกล่าวอยู่ในระบบ!',
                icon: 'error',
                confirmButtonText: 'รับทราบ'
            })
            break
        case "permissionDenial":
            Swal.fire({
                title: 'ไม่ได้รับอนุญาต!',
                icon: 'error',
                confirmButtonText: 'รับทราบ'
            })
            break
        case "passwordNotMatch":
            Swal.fire({
                title: 'รหัสผ่านและยืนยันรหัสผ่านใหม่ไม่ถูกต้อง',
                icon: 'error',
                confirmButtonText: 'รับทราบ'
            })
            break
        case "oldPasswordNotMatch":
            Swal.fire({
                title: 'รหัสผ่านเก่าไม่ถูกต้อง',
                icon: 'error',
                confirmButtonText: 'รับทราบ'
            })
            break
        case "dataHasNoLength":
            Swal.fire({
                title: 'ไม่สามารถ Export เป็น CSV ได้',
                text: 'เนื่องจากข้อมูลมีจำนวนน้อยกว่า 1 แถว',
                icon: 'error',
                confirmButtonText: 'รับทราบ'
            })
            break
    }
}

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function toggleEdit() {
    if(editing) {
        document.querySelectorAll('input').forEach(input => {
            input.removeAttribute('readonly');
        });
        document.querySelectorAll('textarea').forEach(input => {
            input.removeAttribute('readonly');
        });
        document.querySelectorAll('select').forEach(input => {
            input.removeAttribute('readonly');
        });
        document.querySelectorAll('input[type=checkbox]').forEach(input => {
            input.removeAttribute('readonly');
        });
        document.getElementById("save_btn").style.display = "block";
        if(document.getElementById("toggle_btn")) {
            document.getElementById("toggle_btn").style.display = "block";
        }
        editing = false

        document.getElementById('editing_status').classList.remove('btn-success')
        document.getElementById('editing_status').classList.add('btn-secondary')
        document.getElementById('editing_status_text').innerHTML = "<i class='fa-solid fa-eye'></i>"
    } else {
        document.querySelectorAll('textarea').forEach(input => {
            input.setAttribute('readonly', true);
        });
        document.querySelectorAll('input').forEach(input => {
            input.setAttribute('readonly', true);
        });
        document.querySelectorAll('select').forEach(input => {
            input.setAttribute('readonly', true);
        });
        document.querySelectorAll('input[type=checkbox]').forEach(input => {
            input.setAttribute('readonly', true);
        });
        document.getElementById("save_btn").style.display = "none";
        if(document.getElementById("toggle_btn")) {
            document.getElementById("toggle_btn").style.display = "none";
        }
        editing = true

        document.getElementById('editing_status').classList.remove('btn-secondary')
        document.getElementById('editing_status').classList.add('btn-primary')
        document.getElementById('editing_status_text').innerHTML = "<i class='fa-solid fa-pen-to-square'></i>"
    }
}

function getRoute(route) {
    if(route != undefined) {
        return route.split('//')[1].split("/") || "/"
    } else {
        route = document.location.href.split('//')[1].split("/") || "/"
        if(route[1].split("?").length == 2) {
            return (route[0] + "/" + route[1].split("?")[0]).split("/")
        } else {
            return route
        }
    }
}

function initNavigatorItems() {
    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
    document.querySelectorAll('.app-menu a.list-group-item-action[href]').forEach(item => {
        const itemPath = new URL(item.href, window.location.origin).pathname.replace(/\/$/, '') || '/';
        const active = itemPath === currentPath;
        item.classList.toggle('active', active);
        if (active) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
    });
}

initNavigatorItems()

function initializeDataTables(container = document) {
    if (!window.DataTable) return;

    const tables = container.matches?.('table.data-table')
        ? [container]
        : container.querySelectorAll('table.data-table');

    tables.forEach(table => {
        if (DataTable.isDataTable(table)) return;

        table.closest('.table-responsive')?.classList.add('data-table-responsive');

        const responsive = table.classList.contains('stock-import-detail-table')
            ? {
                details: {
                    renderer: (api, rowIndex, columns) => {
                        const hiddenColumns = columns.filter(column => column.hidden);
                        if (!hiddenColumns.length) return false;

                        return `<ul class="list-group list-group-flush">${hiddenColumns.map(column =>
                            `<li class="list-group-item px-0 py-2"><strong>${column.title}</strong><div>${column.data}</div></li>`
                        ).join('')}</ul>`;
                    }
                }
            }
            : true;

        new DataTable(table, {
            autoWidth: false,
            responsive,
            pageLength: 10,
            lengthMenu: [10, 25, 50, 100],
            order: [],
            columnDefs: [{ targets: 'no-sort', orderable: false }],
            language: {
                emptyTable: 'ไม่มีข้อมูลในตาราง',
                info: 'แสดง _START_ ถึง _END_ จากทั้งหมด _TOTAL_ รายการ',
                infoEmpty: 'แสดง 0 ถึง 0 จากทั้งหมด 0 รายการ',
                infoFiltered: '(กรองจากทั้งหมด _MAX_ รายการ)',
                lengthMenu: 'แสดง _MENU_ รายการ',
                loadingRecords: 'กำลังโหลด...',
                processing: 'กำลังประมวลผล...',
                search: 'ค้นหา:',
                zeroRecords: 'ไม่พบข้อมูลที่ตรงกัน',
                paginate: {
                    first: 'แรก',
                    last: 'สุดท้าย',
                    next: 'ถัดไป',
                    previous: 'ก่อนหน้า'
                }
            }
        });
    });
}

function replaceTableContent(container, html) {
    if (window.DataTable) {
        container.querySelectorAll('table.data-table').forEach(table => {
            if (DataTable.isDataTable(table)) {
                new DataTable(table).destroy();
            }
        });
    }

    container.innerHTML = html;
    container.removeAttribute('aria-busy');
    initializeDataTables(container);
}

function showLoadingSkeleton(container, variant = 'table', count = 5) {
    if (!container) return;

    const rows = Math.max(1, Math.min(Number(count) || 5, 8));
    const placeholder = '<span class="loading-skeleton" aria-hidden="true"></span>';
    const content = {
        table: `<div class="loading-skeleton-table" aria-hidden="true">${Array.from({ length: rows }, () =>
            `<div class="loading-skeleton-row">${placeholder}<span class="loading-skeleton loading-skeleton-wide"></span>${placeholder}<span class="loading-skeleton loading-skeleton-actions"></span></div>`
        ).join('')}</div>`,
        cards: `<div class="loading-skeleton-cards" aria-hidden="true">${Array.from({ length: Math.min(rows, 4) }, () =>
            `<div class="loading-skeleton-card"><div class="loading-skeleton loading-skeleton-short"></div><div class="loading-skeleton loading-skeleton-wide"></div><div class="loading-skeleton"></div></div>`
        ).join('')}</div>`,
        catalog: `<div class="row row-cols-1 row-cols-sm-2 g-2 loading-skeleton-catalog" aria-hidden="true">${Array.from({ length: rows }, () =>
            '<div class="col"><div class="loading-skeleton-product"><span class="loading-skeleton loading-skeleton-wide"></span><span class="loading-skeleton"></span><span class="loading-skeleton loading-skeleton-short"></span></div></div>'
        ).join('')}</div>`,
        select: `<div class="loading-skeleton-select" aria-hidden="true">${placeholder}<span class="text-secondary">กำลังโหลดรายการ...</span></div>`,
    }[variant];

    container.setAttribute('aria-busy', 'true');
    container.innerHTML = content || contentForTable(rows);

    function contentForTable(rowCount) {
        return `<div class="loading-skeleton-table" aria-hidden="true">${Array.from({ length: rowCount }, () =>
            `<div class="loading-skeleton-row">${placeholder}<span class="loading-skeleton loading-skeleton-wide"></span>${placeholder}<span class="loading-skeleton loading-skeleton-actions"></span></div>`
        ).join('')}</div>`;
    }
}

function showLoadingError(container, message) {
    if (!container) return;
    container.removeAttribute('aria-busy');
    const error = document.createElement('p');
    error.className = 'text-danger text-center py-4 mb-0';
    error.textContent = message;
    container.replaceChildren(error);
}

initializeDataTables();

function generateDiscountCode() {
    return (Math.random() + 1).toString(36).substring(2).toUpperCase();
}
