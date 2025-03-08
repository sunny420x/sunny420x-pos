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
    let navItems = document.getElementsByClassName('list-group-item-action')

    for(i = 0; i < navItems.length; i++) {
        if(getRoute(navItems[i].href)[1] == getRoute()[1]) {
            navItems[i].classList.add('active')
            return;
        }
    }
}

initNavigatorItems()