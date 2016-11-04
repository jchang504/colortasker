var APP_NAME = 'chronothea'

var TASK_REGEX = /\((\d{1,2})(?:;(\d{2}))?\) .*/;
var EVENT_TIME_REGEX = /(\d{2}):(\d{2}) – (\d{2}):(\d{2}) /;
var SHORT_EVENT_TIME_REGEX = /(\d{2}):(\d{2}) - .*/;

var ALL_DAY_EVENTS_ROW_SELECTOR = 'div#weekViewAllDaywk > table.st-grid > tbody > tr';
var ALL_DAY_EVENT_SELECTOR = 'td.st-c';
var DAY_COLUMN_SELECTOR_PREFIX = 'div#tgCol'
// :not(:has... => Filter out reminders, which look similar but have an extra
// span for the reminder icon.
var SCHEDULED_EVENT_TIME_SELECTOR = 'div.tg-gutter dl.cbrd > dt > span.chip-caption:not(:has(span.cwci.rem-ic))'
var SCHEDULED_EVENT_TITLE_SELECTOR = 'div.tg-gutter dl.cbrd > dd > div.cpchip span:first-child'
var DAY_COLUMN_TOP_DIV_SELECTOR_VARIABLE = '#tgTable > tbody > tr:nth-child(2) > td:nth-child(columnIndex) > div:nth-child(divIndex)'
var TODAY_COLUMN_SHADING_DIV_SELECTOR = 'div.tg-today'

var TOP_DIV_BEFORE_CSS =
    ':before { \
        display: block; \
        text-align: center; \
        font-size: 3em; \
        content: "extraTime" \
    }';

// A best guess for the average duration of short events.
var SHORT_EVENT_DURATION = 30;

// TODO: Allow the user to customize these via a front end.
var MINUTES_IN_DAY = 24 * 60;
var DAILY_TASKS = [
    ["sleep", 8 * 60, 8 * 60],
    ["morning_prep", 20, 8 * 60 + 20],
    ["lunch", 40, 14 * 60],
    ["dinner", 40, 20 * 60],
    ["night_prep", 40, 23 * 60 + 59]
]

// The ideal amount of unallocated extra time per day.
var IDEAL_LEEWAY = 150;
// How much to increase G and B values of color per minute of extra time.
var SHADE_GRADIENT = 255 / IDEAL_LEEWAY;

// Sums and returns the total time of tasks (in minutes) for each day of the
// week as an array.
function taskTimeSums() { 
    var sums = [0, 0, 0, 0, 0, 0, 0];  // In minutes.
    // The indices of the days which still have more tasks to process. Needed
    // todeterm ine which day a task belongs to, since some rows have < 7 tds.
    var stillHaveTasks = [0, 1, 2, 3, 4, 5, 6];
    $(ALL_DAY_EVENTS_ROW_SELECTOR).each(function() {
        // The relative columns which had their last task in this row.
        var lastTaskInThisRow = [];
        $(this).children(ALL_DAY_EVENT_SELECTOR).each(
                function(relativeColumn) {
            var m = $(this).text().match(TASK_REGEX);
            if (m !== null) {
                day = stillHaveTasks[relativeColumn]
                sums[day] += parseInt(m[1]) * 60  // Add hours.
                if (typeof m[2] !== 'undefined') {
                    sums[day] += parseInt(m[2]);  // Add minutes.
                }
            }
            if (this.hasAttribute('rowspan')) {
                lastTaskInThisRow.push(relativeColumn);
            }
        });
        // Remove the days which had their last task in this row.
        var daysRemoved = 0;
        lastTaskInThisRow.forEach(function(relativeColumn) {
            stillHaveTasks.splice(relativeColumn-daysRemoved, 1);
            daysRemoved++;
        });
    });
    return sums;
}

// Sums and returns the total time of scheduled events (in minutes) for each
// day of the week as an array.
function eventTimeSums() {
    var sums = [0, 0, 0, 0, 0, 0, 0];  // In minutes.
    for (var i = 0; i < sums.length; i++) {
        var jqDayColumn = $(DAY_COLUMN_SELECTOR_PREFIX + parseInt(i));
        jqDayColumn.find(SCHEDULED_EVENT_TIME_SELECTOR).each(function() {
            // Add regular, > 40 min scheduled events
            var eventMatch = $(this).text().match(EVENT_TIME_REGEX);
            if (eventMatch !== null) {
                var startMinutes = parseInt(eventMatch[1]) * 60 +
                        parseInt(eventMatch[2]);
                var endMinutes = parseInt(eventMatch[3]) * 60 +
                        parseInt(eventMatch[4]);
                // Handle overnight events: add time to next day.
                if (endMinutes < startMinutes) {
                    if (i < sums.length-1) {
                        sums[i+1] += endMinutes;
                    }
                    endMinutes = 24 * 60;  // Change end to midnight.
                }
                sums[i] += endMinutes - startMinutes;
            }
            // Add short, <= 40 min scheduled events as SHORT_EVENT_DURATION.
            var shortMatch = $(this).text().match(SHORT_EVENT_TIME_REGEX);
            if (shortMatch !== null) {
                sums[i] += SHORT_EVENT_DURATION;
            }
        });
    }
    return sums;
}

// Sums and returns the total time of DAILY_TASKS (in minutes) for day, taking
// into account matching scheduled events (and the current time for today).
// int day : the index (from zero) of the day of the week.
// boolean isToday : whether the day is today.
// int currentTime : the current time in minutes elapsed.
function dailyTaskTimeSum(day, isToday, currentTime) {
    var sum = 0;
    var jqScheduledEvents = $(DAY_COLUMN_SELECTOR_PREFIX + parseInt(day))
            .find(SCHEDULED_EVENT_TITLE_SELECTOR);
    for (var i = 0; i < DAILY_TASKS.length; i++) {
        var taskTitle = DAILY_TASKS[i][0];
        var matchesScheduledEvent = false;
        jqScheduledEvents.each(function() {
            var eventTitle = $(this).text();
            if (eventTitle.toLowerCase().indexOf(taskTitle) !== -1) {
                matchesScheduledEvent = true;
            }
        });
        // Unless scheduled event's title matches a daily task or, for today,
        // current time is past daily task's end threshold, count the usual
        // time for the daily task.
        if (!matchesScheduledEvent && !(isToday &&
            currentTime >= DAILY_TASKS[i][2])) {
            sum += DAILY_TASKS[i][1];
        }
    }
    return sum;
}

// Compute the unallocated time in the day, adjusting based on the current time
// for today.
// int allocatedTime : the amount of time (in minutes) allocated in the day.
// boolean isToday : whether the day is today.
// Returns: int.
function computeExtraTime(day, isToday, allocatedTime) {
    var date = new Date();
    var minutesElapsed = date.getHours() * 60 + date.getMinutes();
    var extraTime = MINUTES_IN_DAY - allocatedTime -
            dailyTaskTimeSum(day, isToday, minutesElapsed);
    if (isToday) {
        extraTime -= minutesElapsed;
    }
    return extraTime;
}

// Format timeAmount into a 2-digit string, adding leading zero if needed.
// Requires: timeAmount >= 0.
// Returns: string.
function formatTwoDigit(timeAmount) {
    var timeString = timeAmount.toString();
    if (timeAmount < 10) {
        timeString = "0" + timeString;
    }
    return timeString;
}

// Compute the color for the day based on the extraTime.
// int extraTime : the amount of extraTime in this day.
// Returns : string.
function computeColor(extraTime) {
    var gAndBValue;
    if (extraTime >= IDEAL_LEEWAY) {
        gAndBValue = '255';
    }
    else {
        if (extraTime < 0) {
            // TODO: Add case to make blinking red when < 0.
            extraTime = 0;
        }
        gAndBValue = Math.round(extraTime * SHADE_GRADIENT).toString();
    }
    return 'rgba(255,' + gAndBValue + ',' + gAndBValue + ',0.6)';
}

// Generate the CSS for adding the extra time label for day. Also include the
// CSS for coloring the extra time label div.
// int day : the index (from zero) of the day of the week.
// boolean isToday : whether the day is today (for adjusting div index).
// int extraTime : the amount of extra time on this day in minutes.
// string color : the CSS value for background-color for this day.
// Returns : string.
function addExtraTimeLabel(day, isToday, extraTime, color) {
    // Today column has an extra div for its shading.
    var divIndex = isToday ? 2 : 1;
    var topDivSelector = DAY_COLUMN_TOP_DIV_SELECTOR_VARIABLE.replace(
            'columnIndex', (day+2).toString()).replace('divIndex', divIndex);
    var sign = extraTime < 0 ? "-" : "";
    var extraHours = Math.floor(Math.abs(extraTime) / 60);
    var extraMinutes = Math.abs(extraTime) % 60;
    var labelCss = topDivSelector + TOP_DIV_BEFORE_CSS.replace('extraTime',
            sign + extraHours.toString() + ":" + formatTwoDigit(extraMinutes));
    var colorCss = topDivSelector + '{background-color:' + color + '}';
    return colorCss + labelCss;
}

// Change the background colors of the day columns based on timeSums, and add a
// text label with the extra time at the top of each column.
function colorDays(timeSums) {
    var css = '';
    for (var i = 0; i < timeSums.length; i++) {
        var colSelector = DAY_COLUMN_SELECTOR_PREFIX + parseInt(i);
        var isToday = false;
        if ($(colSelector).parent().has(TODAY_COLUMN_SHADING_DIV_SELECTOR)
                .size() > 0) {
            isToday = true;
        }
        var extraTime = computeExtraTime(i, isToday, timeSums[i]);
        // Color column.
        var color = computeColor(extraTime);
        css += colSelector + '{background-color:' + color + '}'
        // Add extra time text label at top of column.
        css += addExtraTimeLabel(i, isToday, extraTime, color);
    }
    $('#' + APP_NAME).text(css);
}

// Compute the sums of event and task times and color the day columns.
function updateColors() {
    var timeSums = eventTimeSums();
    var taskSums = taskTimeSums();
    for (var i = 0; i < timeSums.length; i++) {
        timeSums[i] += taskSums[i];
    }
    colorDays(timeSums);
}

$(window).load(function() {
    // Poll every 100ms until task time sums are positive (all-day events have
    // been loaded). They seem to always load later than scheduled events.
    var pollTasksLoaded = setInterval(function() {
        var d = new Date();
        var timeSums = taskTimeSums();
        if (timeSums.reduce((x, y) => x + y, 0) > 0) {
            // Initialize <style> tag.
            $('head').append('<style id="' + APP_NAME +
                    '" type="text/css"></style>');
            updateColors();
            clearInterval(pollTasksLoaded);
        }
        else {
            console.log('All-day events not loaded yet, waiting 100ms.');
        }
    }, 100);

    // Continuously re-compute and update colors every 500ms.
    var continuousUpdate = setInterval(updateColors, 500);
});
