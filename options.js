var DAILY_TASKS_TABLE_SELECTOR = '#daily_tasks > tbody';
var DAILY_TASK_ROWS_SELECTOR = '#daily_tasks tr:not(:first-child)';
var DAILY_TASK_LAST_ROW_SELECTOR = '#daily_tasks tr:last-child';
var DAILY_TASK_DELETE_SELECTOR = 'button.delete';
var INPUT_SELECTOR = 'input';
var INPUT_TEXT_SELECTOR = 'input[type="text"]';
var INPUT_NUMBER_SELECTOR = 'input[type="number"]';
var INPUT_TIME_SELECTOR = 'input[type="time"]';
var INPUT_LEEWAY_SELECTOR = 'input[name="leeway"]';
var INPUT_SHORT_EVENT_DURATION_SELECTOR = 'input[name="short_event_duration"]';
var INPUT_TRANSITION_TIME_SELECTOR = 'input[name="transition_time"]';
var INPUT_BLINK_SELECTOR = 'input[name="blink"]';
var INPUT_COLOR_R = 'input[name="color_r"]';
var INPUT_COLOR_G = 'input[name="color_g"]';
var INPUT_COLOR_B = 'input[name="color_b"]';
var OPTIONS_FORM_SELECTOR = '#options';
var ADD_DAILY_TASK_BUTTON_SELECTOR = '#add_daily_task';
var SAVE_BUTTON_SELECTOR = '#save';
var DISABLED = 'disabled';

var DAILY_TASK_HTML = ' \
    <tr> \
        <td><input required type="text" maxlength="50"></td> \
        <td><input required type="number" min="0" max="1440"></td> \
        <td><input required type="time"></td> \
        <td><button class="delete">Delete</button></td> \
    </tr> \
';

function addDailyTask() {
    $(DAILY_TASKS_TABLE_SELECTOR).append(DAILY_TASK_HTML);
    var jqDailyTaskRow = $(DAILY_TASK_LAST_ROW_SELECTOR);
    jqDailyTaskRow.find(INPUT_SELECTOR).change(enableSaveButton);
    jqDailyTaskRow.find(DAILY_TASK_DELETE_SELECTOR).click(function() {
        jqDailyTaskRow.remove();
        enableSaveButton();
    });
}

function getDailyTasks() {
    var dailyTasks = [];
    $(DAILY_TASK_ROWS_SELECTOR).each(function() {
        var jqThis = $(this);
        var name = jqThis.find(INPUT_TEXT_SELECTOR).val();
        var duration = parseInt(jqThis.find(INPUT_NUMBER_SELECTOR).val());
        var time = jqThis.find(INPUT_TIME_SELECTOR).val().split(':');
        var completedBy = parseInt(time[0]) * 60 + parseInt(time[1]);
        dailyTasks.push({
            name: name,
            duration: duration,
            completedBy: completedBy
        });
    });
    return dailyTasks;
}

function restoreDailyTasks(dailyTasks) {
    for (var i = 0; i < dailyTasks.length; i++) {
        addDailyTask();
        var jqDailyTaskRow = $(DAILY_TASK_LAST_ROW_SELECTOR);
        jqDailyTaskRow.find(INPUT_TEXT_SELECTOR).val(dailyTasks[i].name);
        jqDailyTaskRow.find(INPUT_NUMBER_SELECTOR).val(dailyTasks[i].duration);
        var completedBy = dailyTasks[i].completedBy;
        var addLeadingZero = function(timeAmount) {
            return (timeAmount < 10 ? '0' : '') + timeAmount.toString();
        };
        var time = addLeadingZero(Math.floor(completedBy / 60)) + ':' +
                addLeadingZero(completedBy % 60) + ':00';
        jqDailyTaskRow.find(INPUT_TIME_SELECTOR).val(time);
    }
}

// Saves options to chrome.storage.sync.
function saveOptions() {
    var dailyTasks = getDailyTasks();
    var leeway = parseInt($(INPUT_LEEWAY_SELECTOR).val());
    var shortEventDuration = parseInt($(INPUT_SHORT_EVENT_DURATION_SELECTOR)
            .val());
    var transitionTime = parseInt($(INPUT_TRANSITION_TIME_SELECTOR).val());
    var blink = $(INPUT_BLINK_SELECTOR).is(':checked');
    var colorR = parseInt($(INPUT_COLOR_R).val());
    var colorG = parseInt($(INPUT_COLOR_G).val());
    var colorB = parseInt($(INPUT_COLOR_B).val());
    chrome.storage.sync.set({
        dailyTasks: dailyTasks,
        leeway: leeway,
        shortEventDuration: shortEventDuration,
        transitionTime: transitionTime,
        blink: blink,
        colorR: colorR,
        colorG: colorG,
        colorB: colorB
    }, function() {
        // Disable save button to indicate that options are saved.
        $(SAVE_BUTTON_SELECTOR).prop(DISABLED, true);
    });
    return false;
}

// Restores options as previously stored in chrome.storage.sync.
function restoreOptions() {
    // Default values.
    chrome.storage.sync.get({
        dailyTasks: [],
        leeway: 100,
        shortEventDuration: 30,
        transitionTime: 10,
        blink: true,
        colorR: 255,
        colorG: 0,
        colorB: 0
    }, function(items) {
        restoreDailyTasks(items.dailyTasks);
        $(INPUT_LEEWAY_SELECTOR).val(items.leeway);
        $(INPUT_SHORT_EVENT_DURATION_SELECTOR).val(items.shortEventDuration);
        $(INPUT_TRANSITION_TIME_SELECTOR).val(items.transitionTime);
        $(INPUT_BLINK_SELECTOR).prop('checked', items.blink);
        $(INPUT_COLOR_R).val(items.colorR);
        $(INPUT_COLOR_G).val(items.colorG);
        $(INPUT_COLOR_B).val(items.colorB);
    });
}

function enableSaveButton() {
    $(SAVE_BUTTON_SELECTOR).prop(DISABLED, false);
}

// Load stored options.
$(document).ready(restoreOptions);

// Set up add button.
$(ADD_DAILY_TASK_BUTTON_SELECTOR).click(addDailyTask);

// Set up save button.
$(OPTIONS_FORM_SELECTOR).submit(saveOptions);
$(SAVE_BUTTON_SELECTOR).prop(DISABLED, true);
$(INPUT_SELECTOR).change(enableSaveButton);
