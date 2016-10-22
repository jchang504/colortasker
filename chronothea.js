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
var DAY_COLUMN_TOP_DIV_SELECTOR_VARIABLE = '#tgTable > tbody > tr:nth-child(2) > td:nth-child(columnIndex) > div:nth-child(divIndex)'
var TODAY_COLUMN_SHADING_DIV_SELECTOR = 'div.tg-today'

var TOP_DIV_BEFORE_CSS =
    ':before { \
        display: block; \
        text-align: center; \
        font-size: 3em; \
        content: "extraMinutes" \
    }';

// How much to increase G and B values of color per minute of extra time.
var SHADE_GRADIENT = 2.833333333;  // 255 / 90 [90 minutes gives white].

// A best guess for the average duration of short events.
var SHORT_EVENT_DURATION = 30;

// TODO: Allow the user to customize these via a front end.
var MINUTES_IN_DAY = 24 * 60;
var SLEEP = 8 * 60;
var MEALS = 15 + 40 + 40;  // Breakfast + lunch + dinner.
var MORNING_NIGHT_PREP = 20 + 40;
var TRAVEL = 60;
var EMAIL_FACEBOOK = 20;  // Average day; doesn't include special tasks.
var WORK_MINUTES = MINUTES_IN_DAY - SLEEP - MEALS - MORNING_NIGHT_PREP - TRAVEL
        - EMAIL_FACEBOOK;
// The ideal amount of unallocated extra time per day.
var IDEAL_LEEWAY = 90;

// Sums and returns the total time of tasks (in minutes) for each day of the
// week as an array.
function taskTimeSums(){ 
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

// Change the background colors of the day columns based on timeSums, and add a
// text label with the extra time at the top of each column.
function colorDays(timeSums) {
    var css = '';
    for (var i = 0; i < timeSums.length; i++) {
        var colSelector = DAY_COLUMN_SELECTOR_PREFIX + parseInt(i);
        // Today column has an extra div for its shading.
        var divIndex;
        if ($(colSelector).parent().has(TODAY_COLUMN_SHADING_DIV_SELECTOR)
                .size() > 0) {
            divIndex = 2;
        } else {
            divIndex = 1;
        }
        var topDivSelector = DAY_COLUMN_TOP_DIV_SELECTOR_VARIABLE.replace(
                'columnIndex', (i+2).toString()).replace('divIndex', divIndex);
        var extraMinutes = WORK_MINUTES - timeSums[i];
        // Add extra time text label at top of column.
        css += topDivSelector + TOP_DIV_BEFORE_CSS.replace('extraMinutes',
                extraMinutes.toString());
        // Color column.
        var gAndBValue;
        if (extraMinutes >= IDEAL_LEEWAY) {
            gAndBValue = '255';
        }
        else {
            if (extraMinutes < 0) {
                // TODO: Add case to make blinking red when < 0.
                extraMinutes = 0;
            }
            gAndBValue = Math.round(extraMinutes * SHADE_GRADIENT).toString();
        }
        var color = 'rgba(255,' + gAndBValue + ',' + gAndBValue + ',0.6)';
        css += colSelector + '{background-color:' + color + '}'
        css += topDivSelector + '{background-color:' + color + '}'
        $('#' + APP_NAME).text(css);
    }
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
