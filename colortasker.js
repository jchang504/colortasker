var APP_NAME = 'colortasker'

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
var COLUMN_INDEX_REPLACE_KEY = 'columnIndex';
var DIV_INDEX_REPLACE_KEY = 'divIndex';
var DAY_COLUMN_TOP_DIV_SELECTOR_VARIABLE =
        '#tgTable > tbody > tr:nth-child(2) > td:nth-child(' +
        COLUMN_INDEX_REPLACE_KEY + ') > div:nth-child(' + DIV_INDEX_REPLACE_KEY
        + ')';
var TODAY_COLUMN_SHADING_DIV_SELECTOR = 'div.tg-today'

var EXTRA_TIME_REPLACE_KEY = 'extraTime';
var TOP_DIV_BEFORE_CSS =
    ':before { \
        display: block; \
        text-align: center; \
        font-size: 3em; \
        content: "' +
        EXTRA_TIME_REPLACE_KEY + 
    '"}';
var R_REPLACE_KEY = 'pixelRValue';
var G_REPLACE_KEY = 'pixelGValue';
var B_REPLACE_KEY = 'pixelBValue';
var BLINKING_KEYFRAMES_CSS =
    '@keyframes blinking { \
        0% { background-color: rgba(' + R_REPLACE_KEY + ',' + G_REPLACE_KEY +
                ',' + B_REPLACE_KEY + ', 0.6); } \
        50% { background-color: rgba(255, 255, 255, 0.6); } \
        100% { background-color: rgba(' + R_REPLACE_KEY + ',' + G_REPLACE_KEY +
                ',' + B_REPLACE_KEY + ', 0.6); } \
    }';
var BLINKING_ANIMATION_CSS =
    ' \
    animation-name: blinking; \
    animation-duration: 1s; \
    animation-iteration-count: infinite \
    ';

var MINUTES_IN_DAY = 24 * 60;

// Set from user's options.

// An array of objects with name, duration, and completedBy time.
var DAILY_TASKS;
// When the user's day starts and ends, for time remaining calculation.
var START_OF_DAY;
var END_OF_DAY;
// The ideal amount of unallocated extra time per day.
var IDEAL_LEEWAY;
// A best guess for the average duration of short events.
var SHORT_EVENT_DURATION;
// Time needed to transition between events.
var EVENT_TRANSITION_TIME;
// Whether to blink days with negative free time.
var BLINK;
// The R value of the maximum shading color.
var MAX_SHADE_R;
// The G value of the maximum shading color.
var MAX_SHADE_G;
// The B value of the maximum shading color.
var MAX_SHADE_B;

// Sums and returns the total time of tasks (in minutes) for each day of the
// week as an array.
function taskTimeSums() { 
    var sums = [0, 0, 0, 0, 0, 0, 0];  // In minutes.
    // The indices of the days which still have more tasks to process. Need
    // to determine which day a task belongs to, since some rows have < 7 tds.
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

// Sums and returns the total time of scheduled events (in minutes) for day,
// taking into account the currentTime if isToday.
// int day : the index (from zero) of the day of the week.
// boolean isToday : whether the day is today.
// int currentTime : the current time in minutes.
function scheduledEventTimeSum(day, isToday, currentTime) {
    var sum = 0;
    var jqDayColumn = $(DAY_COLUMN_SELECTOR_PREFIX + parseInt(day));
    jqDayColumn.find(SCHEDULED_EVENT_TIME_SELECTOR).each(function() {
        // Add regular, > 40 min scheduled events
        var eventMatch = $(this).text().match(EVENT_TIME_REGEX);
        if (eventMatch !== null) {
            var startMinutes = parseInt(eventMatch[1]) * 60 +
                    parseInt(eventMatch[2]);
            var endMinutes = parseInt(eventMatch[3]) * 60 +
                    parseInt(eventMatch[4]);
            // For overnight events, upper bound end time by midnight.
            if (endMinutes < startMinutes) {
                endMinutes = 24 * 60;
            }
            // Add transition time.
            endMinutes += EVENT_TRANSITION_TIME;
            // If isToday, adjust event duration based on the currentTime.
            if (isToday) {
                startMinutes = Math.max(startMinutes, Math.min(currentTime,
                        endMinutes));
            }
            sum += endMinutes - startMinutes;
        }
        // Add short, <= 40 min scheduled events as SHORT_EVENT_DURATION.
        var shortMatch = $(this).text().match(SHORT_EVENT_TIME_REGEX);
        if (shortMatch !== null) {
            // TODO: This duplicates logic, but won't need text parsing once we
            // move to Calendar API anyway.
            var startMinutes = parseInt(shortMatch[1]) * 60 +
                    parseInt(shortMatch[2]);
            var endMinutes = startMinutes + SHORT_EVENT_DURATION;
            // For overnight events, upper bound end time by midnight.
            if (endMinutes < startMinutes) {
                endMinutes = 24 * 60;
            }
            // If isToday, adjust event duration based on the currentTime.
            if (isToday) {
                startMinutes = Math.max(startMinutes, Math.min(currentTime,
                        endMinutes));
            }
            sum += endMinutes - startMinutes;
        }
    });
    return sum;
}

// Sums and returns the total time of DAILY_TASKS (in minutes) for day, taking
// into account matching scheduled events (and the current time for today).
// int day : the index (from zero) of the day of the week.
// boolean isToday : whether the day is today.
// int currentTime : the current time in minutes.
function dailyTaskTimeSum(day, isToday, currentTime) {
    var sum = 0;
    var jqScheduledEvents = $(DAY_COLUMN_SELECTOR_PREFIX + parseInt(day))
            .find(SCHEDULED_EVENT_TITLE_SELECTOR);
    for (var i = 0; i < DAILY_TASKS.length; i++) {
        var taskTitle = DAILY_TASKS[i].name.toLowerCase();
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
            currentTime >= DAILY_TASKS[i].completedBy)) {
            sum += DAILY_TASKS[i].duration;
        }
    }
    return sum;
}

// Compute the unallocated time in the day, adjusting based on the current time
// for today.
// boolean isToday : whether the day is today.
// int currentTime : the current time in minutes.
// int allocatedTime : the amount of time (in minutes) allocated in the day.
// Returns: int.
function computeExtraTime(isToday, currentTime, allocatedTime) {
    var startOfDay = START_OF_DAY;
    if (isToday) {
        var startOfDay = Math.max(START_OF_DAY, currentTime);
    }
    var endOfDay = END_OF_DAY;
    if (endOfDay <= START_OF_DAY) {
        // End of day goes into the next day (e.g. 1am).
        endOfDay += MINUTES_IN_DAY;
    }
    return endOfDay - startOfDay - allocatedTime;
}

// Format timeAmount into a 2-digit string, adding leading zero if needed.
// Requires: timeAmount >= 0.
// int timeAmount : a number in [0, 60].
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
    var blinkingCss = '';
    if (extraTime > IDEAL_LEEWAY) {
        extraTime = IDEAL_LEEWAY;
    }
    else if (extraTime < 0) {
        extraTime = 0;
        if (BLINK) {
            blinkingCss = ';' + BLINKING_ANIMATION_CSS;
        }
    }
    var r = Math.round(MAX_SHADE_R + (extraTime * ((255 - MAX_SHADE_R) /
            IDEAL_LEEWAY))).toString();
    var g = Math.round(MAX_SHADE_G + (extraTime * ((255 - MAX_SHADE_G) /
            IDEAL_LEEWAY))).toString();
    var b = Math.round(MAX_SHADE_B + (extraTime * ((255 - MAX_SHADE_B) /
            IDEAL_LEEWAY))).toString();
    return 'rgba(' + r + ',' + g + ',' + b + ',0.6)' + blinkingCss;
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
            COLUMN_INDEX_REPLACE_KEY, (day+2).toString()).replace(
            DIV_INDEX_REPLACE_KEY, divIndex);
    var sign = extraTime < 0 ? "-" : "";
    var extraHours = Math.floor(Math.abs(extraTime) / 60);
    var extraMinutes = Math.abs(extraTime) % 60;
    var labelCss = topDivSelector + TOP_DIV_BEFORE_CSS.replace(
            EXTRA_TIME_REPLACE_KEY, sign + extraHours.toString() + ":" +
            formatTwoDigit(extraMinutes));
    var colorCss = topDivSelector + '{background-color:' + color + '}';
    return colorCss + labelCss;
}

// Get the current local time in minutes.
// Returns : int.
function getCurrentTimeMinutes() {
    var date = new Date();
    return date.getHours() * 60 + date.getMinutes();
}

// Change the background colors of the day columns and add a text label with
// the extra time at the top of each column.
function colorDays() {
    var taskSums = taskTimeSums();
    // Start with keyframes defined.
    var css = BLINKING_KEYFRAMES_CSS.replace(R_REPLACE_KEY, MAX_SHADE_R)
            .replace(G_REPLACE_KEY, MAX_SHADE_G)
            .replace(B_REPLACE_KEY, MAX_SHADE_B);
    for (var i = 0; i < taskSums.length; i++) {
        var colSelector = DAY_COLUMN_SELECTOR_PREFIX + parseInt(i);
        var isToday = $(colSelector).parent()
                .has(TODAY_COLUMN_SHADING_DIV_SELECTOR).length > 0;
        var currentTime = getCurrentTimeMinutes();
        var allocatedTime = taskSums[i];
        allocatedTime += scheduledEventTimeSum(i, isToday, currentTime);
        allocatedTime += dailyTaskTimeSum(i, isToday, currentTime);
        var extraTime = computeExtraTime(isToday, currentTime, allocatedTime);
        // Color column.
        var color = computeColor(extraTime);
        css += colSelector + '{background-color:' + color + '}'
        // Add extra time text label at top of column.
        css += addExtraTimeLabel(i, isToday, extraTime, color);
    }
    $('#' + APP_NAME).text(css);
}

$(window).on("load", function() {
    $('head').append('<style id="' + APP_NAME + '" type="text/css"></style>');

    // Load user's options before we can compute free times.
    chrome.storage.sync.get({
        dailyTasks: [],
        startOfDay: 480,
        endOfDay: 0,
        leeway: 100,
        shortEventDuration: 30,
        transitionTime: 10,
        blink: true,
        colorR: 255,
        colorG: 0,
        colorB: 0
    }, function(items) {
        // Set calculation options.
        DAILY_TASKS = items.dailyTasks;
        START_OF_DAY = items.startOfDay;
        END_OF_DAY = items.endOfDay;
        IDEAL_LEEWAY = items.leeway;
        SHORT_EVENT_DURATION = items.shortEventDuration;
        EVENT_TRANSITION_TIME = items.transitionTime;
        BLINK = items.blink;
        MAX_SHADE_R = items.colorR;
        MAX_SHADE_G = items.colorG;
        MAX_SHADE_B = items.colorB;
        // Continuously re-compute and update colors every 500ms.
        var continuousUpdate = setInterval(colorDays, 500);
    });
});
