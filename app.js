(function() {

  'use strict';

  return {
  
    events: {
      'app.activated': 'init',
      'click #create-meeting': 'createMeeting',
      'click #check-meeting': 'handleCheckMeetingClicked'
    },

    requests: {
      createWebexMeeting: function(meeting) {
        var that = this,
        
        request = {
          url: this.setting('serviceUrl'),
          type: 'POST',
          dataType: 'text',
          contentType: 'application/xml',
          cors: true
        },
            
        bodyContent = 
          '<bodyContent xsi:type="java:com.webex.service.binding.meeting.CreateMeeting">\n' +
          '<accessControl>\n' +
          '<meetingPassword>' + this.escapeHtml(meeting.password) + '</meetingPassword>\n' +
          '</accessControl>\n' +
          '<metaData>\n' +
          '<confName>' + this.escapeHtml(meeting.topic) + '</confName>\n' +
          '</metaData>\n' +
          '<attendeeOptions>\n' +
          '<emailInvitations>TRUE</emailInvitations>' +
          '</attendeeOptions>\n' +
          '<schedule>\n' +
          '<startDate>' + this.escapeHtml(meeting.startDate) + '</startDate>\n' +
          '<duration>' + this.escapeHtml(meeting.duration) + '</duration>\n' +
          '<timeZoneID>' + this.escapeHtml(meeting.timeZoneID) + '</timeZoneID>\n' +
          '</schedule>\n' +
          '<participants>\n' +
          '<attendees>\n';
              
        _.each(meeting.attendees, function(email) {
          bodyContent += '<attendee><person><email>' + that.escapeHtml(email) + '</email></person></attendee>\n';
        });

        bodyContent += 
          '</attendees>\n' +
          '</participants>\n' +
          '</bodyContent>\n';
        
        request.data = this.createWebexXml(bodyContent);

        return request;
      },

      getTimeZoneList: function() {
        var request = {
          url: this.setting('serviceUrl'),
          type: 'POST',
          dataType: 'text',
          contentType: 'application/xml',
          cors: true
        };
        
        request.data = this.createWebexXml('<bodyContent xsi:type="site.LstTimeZone"></bodyContent>');

        return request;
      },

      getMeetingList: function(formattedStartDate, formattedEndDate, timeZoneID) {
        var request = {
          url: this.setting('serviceUrl'),
          type: 'POST',
          dataType: 'text',
          contentType: 'application/xml',
          cors: true
        };

        request.data = this.createWebexXml(
          '<bodyContent xsi:type="java:com.webex.service.binding.meeting.LstsummaryMeeting">' +
          '<dateScope>\n' +
          '<startDateEnd>' + formattedEndDate + '</startDateEnd>\n' +
          '<endDateStart>' + formattedStartDate + '</endDateStart>\n' +
          '<timeZoneID>' + timeZoneID + '</timeZoneID>\n' +
          '</dateScope>\n' +
          '</bodyContent>');

        return request;
      }
    },

    escapeHtml: function(text) {
      var map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };

      return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    },

    createWebexXml: function(bodyContent) {
      var baseTemplate =
        '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<serv:message xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:serv="http://www.webex.com/schemas/2002/06/service">\n' +
        '<header>\n' +
        '<securityContext>\n' +
        '<webExID>' + this.escapeHtml(this.setting('webExID')) + '</webExID>\n' +
        '<password>' + this.escapeHtml(this.setting('password')) + '</password>\n' +
        '<siteName>' + this.escapeHtml(this.setting('siteName')) + '</siteName>\n' +
        '</securityContext>\n' +
        '</header>\n' +
        '<body>\n' +
        '{{body}}' +
        '</body>\n' +
        '</serv:message>';
        
      return baseTemplate.replace('{{body}}', bodyContent);
    },

    parseAPIError: function($xml) {
      var resultNodes = $xml.find('serv\\:result'),
          resultNode,
          reasonNodes = $xml.find('serv\\:reason');

      if (resultNodes.length > 0) {
        resultNode = resultNodes[0];

        if(resultNode.innerHTML === 'FAILURE') {
          if(reasonNodes.length > 0) {
            return reasonNodes[0].innerHTML;
          } else {
            return 'Unknown error during XML API call.';
          }
        }
      }
    },

    init: function() {
      var that = this,
          i,
          monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
          months = [],
          years = [],
          days = [],
          hours = [],
          minutes = [],
          durations = [],
          currentYear = (new Date()).getFullYear(),
          currentMonth = (new Date()).getMonth(),
          currentDay = (new Date()).getDate();

      // Populate years
      for (i = 0; i < 5; i++) {
        years.push({
          value: (new Date()).getFullYear() + i,
          selected: currentYear === i
        });
      }

      // Populate months
      for (i = 1; i <= 12; i++ ) {
        months.push({
          value: ("00" + i).slice(-2),
          displayValue: monthNames[i-1],
          selected: currentMonth === (i - 1)
        });
      }

      // Populate days
      for (i = 1; i <= 31; i++) {
        days.push({
          value: ("00" + i).slice(-2),
          selected: currentDay === i
        });
      }

      // Populate hours
      for (i = 0; i <= 23; i++) {
        hours.push({
          value: ("00" + i).slice(-2),
          selected: i === 12
        });
      }

      // Populate minutes
      for (i = 0; i <= 59; i++) {
        minutes.push({
          value: ("00" + i).slice(-2)
        });
      }

      // Populate durations
      for (i = 0; i < 13; i++) {
        durations.push({
          value: i * 15,
          selected: (i * 15) === 60
        });
      }

      // Display the loading screen at startup
      this.switchTo('loading');

      // Retrieve all time zones
      this.ajax('getTimeZoneList').done(function(data) {
        var $xml = this.$(data),
          timezones = [],
          attendees,
          gmtZeroFound = false,
          errorMessage;

        attendees = this.ticket().requester().email();

        if (this.ticket().assignee().user() !== undefined) {
          attendees += ',' + this.ticket().assignee().user().email(); 
        }
            
        if ((errorMessage = this.parseAPIError($xml)) !== undefined) {
          this.switchTo('error', { message: errorMessage });
          return;
        }

        // Find the first timezone with GMT+0 and make it selected
        $xml.find('ns1\\:timeZone').each(function(i, n) {
          timezones.push({
            id: that.$(n).children('ns1\\:timeZoneID')[0].innerHTML,
            description: that.$(n).children('ns1\\:description')[0].innerHTML,
            selected: that.$(n).children('ns1\\:gmtOffset')[0].innerHTML === '0' && !gmtZeroFound,
          });

          gmtZeroFound = timezones[i].selected || gmtZeroFound;
        });

        this.switchTo('create-meeting', {
          meetingTopic: '#' + this.ticket().id() + ' / ' + this.ticket().subject(),
          attendees: attendees,
          timezones: timezones,
          years: years,
          months: months,
          days: days,
          hours: hours,
          minutes: minutes,
          durations: durations
        });
      });
    },

    checkOverlap: function(startDate, duration, timeZoneID, trueFunction, falseFunction) {
      var that = this,
          formattedEndDate = moment(startDate, 'MM/DD/YYYY HH:mm:ss').add(duration, 'minutes').format('MM/DD/YYYY HH:mm:ss'),
          $xml,
          startTimestamp,
          endTimestamp,
          meetingStartTimestamp = moment(startDate, 'MM/DD/YYYY HH:mm:ss').unix(),
          meetingEndTimestamp = moment(formattedEndDate, 'MM/DD/YYYY HH:mm:ss').unix(),
          overlap = false,
          meetingName;

      this.ajax('getMeetingList', startDate, formattedEndDate, timeZoneID).done(function (data) {
        $xml = that.$(data);

        $xml.find('meet\\:meeting').each(function(i, n) {
          startDate = that.$(n).children('meet\\:startDate')[0].innerHTML;
          startTimestamp = moment(startDate, 'MM/DD/YYYY HH:mm:ss').unix();
          duration = that.$(n).children('meet\\:duration')[0].innerHTML;
          endTimestamp = moment(startDate, 'MM/DD/YYYY HH:mm:ss').add(duration, 'minutes').unix();

          if (meetingStartTimestamp <= endTimestamp && meetingEndTimestamp >= startTimestamp) {
            meetingName = that.$(n).children('meet\\:confName')[0].innerHTML;
            overlap = true;
          }
        });

        if (overlap) {
          trueFunction(meetingName);
        } else {
          falseFunction();
        }
      });
    },

    handleCheckMeetingClicked: function() {
      var that = this,
          startDate = this.getStartDate();

      this.$('#check-meeting').prop('disabled', true);

      this.checkOverlap(
        startDate,

        this.$('#w-duration').val(),

        this.$('#w-timezone').val(),

        function(meetingName) {
          services.notify('The meeting overlaps with <strong>' + meetingName + '</strong>.', 'error');
          that.$('#check-meeting').prop('disabled', false);
        },
  
        function() {
          services.notify('The meeting doesn\'t overlap with any other meetings.');
          that.$('#check-meeting').prop('disabled', false);
        }
      );
    },

    getStartDate: function() {
      var startDate = this.$('#w-month').val() + '/' +
                      this.$('#w-day').val() + '/' +
                      this.$('#w-year').val() + ' ' +
                      this.$('#w-hour').val() + ':' +
                      this.$('#w-minute').val() + ':00';

      return startDate;
    },

    createMeeting: function() {
      var that = this,
          attendees = this.$('#w-attendees').val().split(','),
          regex = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i,
          startDate,
          errorMessage;

      // Validate each email address
      for (var i = 0; i < attendees.length; i++) {
        attendees[i] = attendees[i].trim();

        if (!regex.test(attendees[i])) {
          services.notify(attendees[i].trim() + ' is not a valid email address.', 'error');
          return;
        }
      }

      startDate = this.getStartDate();
        
      var meeting = {
        topic: this.$('#w-topic').val(),
        password: this.$('#w-password').val(),
        attendees: attendees,
        startDate: startDate,
        duration: this.$('#w-duration').val(),
        timeZoneID: this.$('#w-timezone').val()
      };

      this.$('#create-meeting').prop('disabled', true);

      this.checkOverlap(
        meeting.startDate,

        meeting.duration,

        meeting.timeZoneID,

        function(meetingName) {
          services.notify('The meeting cannot be created because it overlaps with meeting <strong>' + meetingName + '</strong>.', 'error');
          that.$('#create-meeting').prop('disabled', false);
        },
  
        function() {
          that.ajax('createWebexMeeting', meeting).done(function(data) {
            var $xml = that.$(data);

            that.$('#create-meeting').prop('disabled', false);

            if ((errorMessage = that.parseAPIError($xml)) !== undefined) {
              services.notify(errorMessage, 'error');
              return;
            } else {
              that.switchTo('create-meeting-success', { meeting: meeting });
              return;
            }
          });
        }
      );
    }

  };

}());
