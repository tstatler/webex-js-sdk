/* eslint-disable no-warning-comments */

import '@webex/internal-plugin-device';

import WebexCore from '@webex/webex-core';
import testUsers from '@webex/test-helper-test-users';
import {expect} from 'chai';

describe('Multi Party Calling - Dial and Reject', () => {
  let mccoy, roomId, spock;

  before('reload browser', () => {
    browser.refresh();
  });

  before('create test users', () => testUsers.create({count: 2})
    .then((users) => {
      [spock, mccoy] = users;

      // Adding pause to let test users propagate through integration
      browser.pause(2500);

      spock.webex = new WebexCore({
        credentials: {
          authorization: spock.token
        }
      });

      return spock.webex.internal.device.register();
    }));

  before('create test room and add members to room', () => spock.webex.request({
    method: 'POST',
    service: 'hydra',
    resource: 'rooms',
    body: {
      title: 'Call Test'
    }
  })
    .then((res) => {
      const room = res.body;

      roomId = room.id;

      return spock.webex.request({
        method: 'POST',
        service: 'hydra',
        resource: 'memberships',
        body: {
          roomId: room.id,
          personId: mccoy.id
        }
      });
    })
    .then(() => spock.webex.internal.device.unregister()));

  it('loads the app', () => {
    browser.url('/samples/browser-multi-party-call/');
  });

  it('connects mccoy\'s browser', () => {
    expect(browserChrome.getTitle()).to.equal('Sample: Multi Party Calling');
    browserChrome.execute((token) => {
      // eslint-disable-next-line no-undef
      document.querySelector('[placeholder="Your access token"]').value += token;
    }, mccoy.token.access_token);
    browserChrome.$('[title="connect"]').click();
    browserChrome.$('.listening').waitForExist();
  });

  it('connects spock\'s browser', () => {
    expect(browserFirefox.getTitle()).to.equal('Sample: Multi Party Calling');
    browserFirefox.execute((token) => {
      // eslint-disable-next-line no-undef
      document.querySelector('[placeholder="Your access token"]').value += token;
    }, spock.token.access_token);
    browserFirefox.$('[title="connect"]').click();
    browserFirefox.$('.listening').waitForExist();
  });

  it('places call from spock to shared room', () => {
    browserFirefox.$('[placeholder="Room ID or SIP URI"]').setValue(roomId);
    browserFirefox.$('[title="dial"]').click();
    browserFirefox.$(`#member-status-${spock.id}`).waitForExist({timeout: 5000});
    browserFirefox.waitUntil(() =>
      (browserFirefox.$(`#member-status-${spock.id}`).getText() === 'IN_MEETING'),
    {
      timeout: 10000,
      timeoutMsg: `Timed-out waiting for local user (${spock.id}) to connect to meeting`
    });
  });

  it('rejects the call on mccoy', () => {
    browserChrome.waitUntil(() => {
      try {
        const alerttext = browserChrome.getAlertText();

        return alerttext === 'Answer incoming call';
      }
      catch (error) {
        // Error is thrown when alert isn't open which is fine
        return false;
      }
    }, 10000, 'Timed out waiting for incoming call alert');
    browserChrome.dismissAlert();
  });

  it('ends the call', () => {
    browserFirefox.$('[title="hangup"]').click();
    browserFirefox.waitUntil(() =>
      (browserFirefox.$(`#member-status-${spock.id}`).getText() === 'NOT_IN_MEETING'),
    {
      timeout: 10000,
      timeoutMsg: 'Timed-out waiting for local user to disconnect from meeting'
    });
    browser.refresh();
  });
});
