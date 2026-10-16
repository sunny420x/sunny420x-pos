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
    initializeDataTables(container);
}

initializeDataTables();

function generateDiscountCode() {
    return (Math.random() + 1).toString(36).substring(2).toUpperCase();
}
