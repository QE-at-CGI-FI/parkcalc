// Client-side replacement for the server's index.php?action=calculate.
// Mirrors the behaviour observed on https://www.shino.de/parkcalc/ (Nov 2026),
// including its quirks: lot resets to Valet after calculating, times are echoed
// in 24h form with AM re-checked, invalid dates/times give a blank page.

var MINUTES_PER_DAY = 24 * 60;

function parseDate(text) {
    var m = /^(\d+)\/(\d+)\/(\d{4})$/.exec(text);
    if (!m) return null;
    return { month: parseInt(m[1], 10), day: parseInt(m[2], 10), year: parseInt(m[3], 10) };
}

function parseTime(text, ampm) {
    var m = /^(-?\d+)(?::(\d+))?/.exec(text);
    if (!m) return null;
    var hour = parseInt(m[1], 10);
    if (ampm === 'PM' && hour !== 12) hour += 12;
    var echo = hour + ':' + (m[2] === undefined ? '00' : m[2]);
    if (ampm !== 'PM' && hour === 12) hour = 0;
    return { hour: hour, minute: m[2] === undefined ? 0 : parseInt(m[2], 10), echo: echo };
}

// Out-of-range parts roll over (13/40/2026, 10:75, 25:00), like PHP mktime.
function toMinutes(date, time) {
    var ms = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute);
    return ms < 0 ? null : ms / 60000;
}

function valetCost(total) {
    if (total <= 5 * 60) return 12;
    return Math.ceil(total / MINUTES_PER_DAY) * 18;
}

function shortTermCost(days, rest) {
    var cost = Math.min(24, 2 + Math.ceil((rest - 60) / 30));
    if (days === 0) return Math.max(2, cost);
    return days * 24 + cost;
}

// Full hours are capped at the daily max, but under 7 full hours a started
// hour adds $2 on top (so 5h01m costs $11 at Economy). On day six of a week
// extra time is free.
function longTermCost(days, rest, dailyMax) {
    var weeklyMax = 6 * dailyMax;
    var weeks = Math.floor(days / 7);
    var daysInWeek = days % 7;
    if (daysInWeek === 6) return (weeks + 1) * weeklyMax;
    var fullHours = Math.floor(rest / 60);
    var hourPart = Math.min(dailyMax, fullHours * 2) + (rest % 60 > 0 && fullHours < 7 ? 2 : 0);
    return weeks * weeklyMax + daysInWeek * dailyMax + hourPart;
}

function cost(lot, total) {
    var days = Math.floor(total / MINUTES_PER_DAY);
    var rest = total % MINUTES_PER_DAY;
    switch (lot) {
        case 'Valet': return valetCost(total);
        case 'Short': return shortTermCost(days, rest);
        case 'Economy': return longTermCost(days, rest, 9);
        case 'Long-Garage': return longTermCost(days, rest, 12);
        case 'Long-Surface': return longTermCost(days, rest, 10);
        default: return 0;
    }
}

function formatMoney(amount) {
    return '$ ' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDuration(total) {
    var days = Math.floor(total / MINUTES_PER_DAY);
    var hours = Math.floor((total % MINUTES_PER_DAY) / 60);
    return '(' + days + ' Days, ' + hours + ' Hours, ' + (total % 60) + ' Minutes)';
}

function blankPage() {
    document.open();
    document.write('');
    document.close();
}

function calculate(params) {
    var get = function (name) { return params.has(name) ? params.get(name) : ''; };
    var startDate = parseDate(get('StartingDate'));
    var leaveDate = parseDate(get('LeavingDate'));
    var startTime = parseTime(get('StartingTime'), get('StartingTimeAMPM'));
    var leaveTime = parseTime(get('LeavingTime'), get('LeavingTimeAMPM'));
    if (!startDate || !leaveDate || !startTime || !leaveTime) return blankPage();
    var start = toMinutes(startDate, startTime);
    var leave = toMinutes(leaveDate, leaveTime);
    if (start === null || leave === null) return blankPage();

    var form = document.forms.Calculator;
    form.StartingDate.value = get('StartingDate');
    form.LeavingDate.value = get('LeavingDate');
    form.StartingTime.value = startTime.echo;
    form.LeavingTime.value = leaveTime.echo;

    var resultCell = form.querySelector('td.SubHead');
    if (leave < start) {
        resultCell.innerHTML = '<b>ERROR! Your Leaving Date Or Time Is Before Your Starting Date or Time</b>';
        return;
    }
    var total = leave - start;
    resultCell.className = '';
    resultCell.innerHTML = "<span class='SubHead'><b>" + formatMoney(cost(get('ParkingLot'), total)) + '</b></span>' +
        "<span class='BodyCopy'><b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;" + formatDuration(total) + '</b></span>';
}

document.addEventListener('DOMContentLoaded', function () {
    var params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'calculate') calculate(params);
});
