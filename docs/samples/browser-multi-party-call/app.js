/* eslint-env browser */

/* global Webex */

/* eslint-disable camelcase */
/* eslint-disable max-nested-callbacks */
/* eslint-disable no-alert */
/* eslint-disable no-console */
/* eslint-disable require-jsdoc */
/* eslint-disable arrow-body-style */
/* eslint-disable max-len */

// Declare some globals that we'll need throughout
let activeMeeting, webex;

// First, let's wire our form fields up to localStorage so we don't have to
// retype things everytime we reload the page.

[
  'access-token',
  'invitee'
].forEach((id) => {
  const el = document.getElementById(id);

  el.value = localStorage.getItem(id);
  el.addEventListener('change', (event) => {
    localStorage.setItem(id, event.target.value);
  });
});

// There's a few different events that'll let us know we should initialize
// Webex and start listening for incoming calls, so we'll wrap a few things
// up in a function.
function connect() {
  return new Promise((resolve) => {
    if (!webex) {
      // eslint-disable-next-line no-multi-assign
      webex = window.webex = Webex.init({
        config: {
          ...(document.getElementById('integration-env').checked && {
            services: {
              discovery: {
                u2c: 'https://u2c-intb.ciscospark.com/u2c/api/v1',
                hydra: 'https://apialpha.ciscospark.com/v1/'
              }
            }
          }),
          logger: {
            level: 'debug'
          },
          meetings: {
            reconnection: {
              enabled: true
            }
          }
          // Any other sdk config we need
        },

        credentials: {
          access_token: document.getElementById('access-token').value
        }
      });
    }

    // Listen for added meetings
    webex.meetings.on('meeting:added', (addedMeetingEvent) => {
      if (addedMeetingEvent.type === 'INCOMING' || addedMeetingEvent.type === 'JOIN') {
        const addedMeeting = addedMeetingEvent.meeting;

        // Acknowledge to the server that we received the call on our device
        addedMeeting.acknowledge(addedMeetingEvent.type)
          .then(() => {
            if (confirm('Answer incoming call')) {
              joinMeeting(addedMeeting);
              bindMeetingEvents(addedMeeting);
            }
            else {
              addedMeeting.decline();
            }
          });
      }
    });

    // Register our device with Webex cloud
    if (!webex.meetings.registered) {
      webex.meetings.register()
        // Sync our meetings with existing meetings on the server
        .then(() => webex.meetings.syncMeetings())
        .then(() => {
          // This is just a little helper for our selenium tests and doesn't
          // really matter for the example
          document.body.classList.add('listening');
          document.getElementById('connection-status').innerText = 'connected';
          // Our device is now connected
          resolve();
        })
        // This is a terrible way to handle errors, but anything more specific is
        // going to depend a lot on your app
        .catch((err) => {
          console.error(err);
          // we'll rethrow here since we didn't really *handle* the error, we just
          // reported it
          throw err;
        });
    }
    else {
      // Device was already connected
      resolve();
    }
  });
}

// Similarly, there are a few different ways we'll get a meeting Object, so let's
// put meeting handling inside its own function.
function bindMeetingEvents(meeting) {
  // call is a call instance, not a promise, so to know if things break,
  // we'll need to listen for the error event. Again, this is a rather naive
  // handler.
  meeting.on('error', (err) => {
    console.error(err);
  });

  // Handle media streams changes to ready state
  meeting.on('media:ready', (media) => {
    if (!media) {
      return;
    }
    if (media.type === 'local') {
      document.getElementById('self-view').srcObject = media.stream;
    }
    if (media.type === 'remoteVideo') {
      const remoteVideo = document.getElementById('remote-view-video');

      remoteVideo.srcObject = media.stream;
      remoteVideo.onloadedmetadata = ({target: {videoWidth: width, videoHeight: height}}) => {
        document.getElementById('remote-view-stats-resolution').innerText = `${width} x ${height}`;
      };
      remoteVideo.onresize = ({target: {videoWidth: width, videoHeight: height}}) => {
        document.getElementById('remote-view-stats-resolution').innerText = `${width} x ${height}`;
      };
    }
    if (media.type === 'remoteAudio') {
      document.getElementById('remote-view-audio').srcObject = media.stream;
    }
  });

  // Handle media streams stopping
  meeting.on('media:stopped', (media) => {
    // Remove media streams
    if (media.type === 'local') {
      document.getElementById('self-view').srcObject = null;
    }
    if (media.type === 'remoteVideo') {
      document.getElementById('remote-view-video').srcObject = null;
      document.getElementById('remote-view-stats-resolution').innerText = '';
    }
    if (media.type === 'remoteAudio') {
      document.getElementById('remote-view-audio').srcObject = null;
    }
  });

  // Update participant info
  meeting.members.on('members:update', (delta) => {
    const {full: membersData} = delta;
    const memberIDs = Object.keys(membersData);
    let memberTableHTML = '';

    memberIDs.forEach((memberID) => {
      const memberObject = membersData[memberID];

      // Devices are listed in the memberships object.
      // We are not concerned with them in this demo
      if (memberObject.isUser) {
        const personId = memberObject.participant.person.id;
        const memberTableRowHTML = `<tr id="member-${personId}">
        <td id="member-name-${personId}">${memberObject.name}</td>
        <td id="member-status-${personId}">${memberObject.status}</td>
        <td id="member-isSelf-${personId}">${memberObject.isSelf}</td>
        </tr>`;

        memberTableHTML = memberTableHTML.concat(memberTableRowHTML);
      }
    });

    document.getElementById('call-members').innerHTML = memberTableHTML;
  });

  // Of course, we'd also like to be able to leave the meeting:
  document.getElementById('hangup').addEventListener('click', () => {
    meeting.leave();
  });

  meeting.on('all', (event) => {
    console.log(event);
  });

  return meeting;
}

// Join the meeting and add media
function joinMeeting(meeting) {
  return meeting.join().then(() => {
    return meeting.getSupportedDevices({sendAudio: true, sendVideo: true})
      .then(({sendAudio, sendVideo}) => {
        const mediaSettings = {
          receiveVideo: true,
          receiveAudio: true,
          receiveShare: false,
          sendShare: false,
          sendVideo,
          sendAudio
        };

        return meeting.getMediaStreams(mediaSettings).then((mediaStreams) => {
          const [localStream, localShare] = mediaStreams;

          meeting.addMedia({
            localShare,
            localStream,
            mediaSettings
          });
        });
      });
  });
}

// In order to simplify the state management needed to keep track of our button
// handlers, we'll rely on the current meeting global object and only hook up event
// handlers once.

document.getElementById('hangup').addEventListener('click', () => {
  if (activeMeeting) {
    activeMeeting.leave();
  }
});

// Now, let's set up incoming call handling
document.getElementById('credentials').addEventListener('submit', (event) => {
  // let's make sure we don't reload the page when we submit the form
  event.preventDefault();

  // The rest of the incoming call setup happens in connect();
  connect();
});

// And finally, let's wire up dialing
document.getElementById('dialer').addEventListener('submit', (event) => {
  // again, we don't want to reload when we try to dial
  event.preventDefault();

  const destination = document.getElementById('invitee').value;

  // we'll use `connect()` (even though we might already be connected or
  // connecting) to make sure we've got a functional webex instance.
  connect()
    // Create the meeting
    .then(() => webex.meetings.create(destination))
    // Save meeting
    .then((meeting) => {
      activeMeeting = meeting;

      return meeting;
    })
    // Call our helper function for binding events to meetings
    .then(bindMeetingEvents)
    // Pass the meeting to our join meeting helper
    .then(joinMeeting)
    .catch((error) => {
      // Report the error
      console.error(error);

      // Implement error handling here
    });
});

document.getElementById('submit').addEventListener('click', (e) => {
  e.preventDefault();

  const layout = document.getElementById('layout').value;
  const width = document.getElementById('width').value;
  const height = document.getElementById('height').value;

  return activeMeeting.changeVideoLayout(layout, {main: {height, width}});
});
