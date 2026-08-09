'use strict';

const DEFAULT_VCONNECT_URL = 'ws://localhost:39542';
const DEFAULT_TIKTOK_URL = 'ws://localhost:21213';
const RETRY_DELAY = 30000;
const TIKTOK_RETRY_DELAY = 5000;
const DEFAULT_STORAGE_KEY = 'vconnectTikTokConfig';

export class TikfinitySystem {
    constructor(options = {}) {
      this.vconnectUrl = options.vconnectUrl || DEFAULT_VCONNECT_URL;
      this.tiktokUrl = options.tiktokUrl || DEFAULT_TIKTOK_URL;
      this.storageKey = options.storageKey || DEFAULT_STORAGE_KEY;

      this.vconnectSocket = null;
      this.tiktokSocket = null;

      this.triggers = [];
      this.giftMappings = new Map();
      this.followUid = null;
      this.subscribeUid = null;
      this.likeMappings = [];
      this.userLikeTotals = new Map();
      this.userNicknames = new Map();
      this.triggeredLikeGoals = new Map();
      this.tiktokReconnectAttempts = 0;
      this.requestCounter = 0;

      this._listeners = new Map();
      this._config = {
        triggers: [],
        giftMappings: {},
        followUid: null,
        subscribeUid: null,
        likeMappings: [],
        lastUpdated: null
      };

      this.loadConfig();
    }

    on(event, handler) {
      if (!this._listeners.has(event)) this._listeners.set(event, []);
      this._listeners.get(event).push(handler);
      return this;
    }

    off(event, handler) {
      const handlers = this._listeners.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      }
      return this;
    }

    emit(event, data) {
      const handlers = this._listeners.get(event);
      if (handlers) {
        handlers.slice().forEach(handler => handler(data));
      }
    }

    log(message, isError = false) {
      const now = new Date();
      const timestamp = `${now.toLocaleTimeString()}.${now.getMilliseconds().toString().padStart(3, '0')}`;
      const logMessage = `[${timestamp}] ${message}`;

      if (isError) {
        console.error(logMessage);
      } else {
        console.log(logMessage);
      }

      this.emit('log', { message: logMessage, isError });

      const logDiv = document.getElementById('log');
      if (logDiv) {
        const logEntry = document.createElement('div');
        logEntry.style.marginBottom = '5px';
        if (isError) logEntry.style.color = 'red';
        logEntry.textContent = logMessage;
        logDiv.appendChild(logEntry);
        logDiv.scrollTop = logDiv.scrollHeight;
      }
    }

    nextRequestId() {
      this.requestCounter += 1;
      return `${this.requestCounter}`;
    }

    vconnectEnvelope(messageType, requestID, data = {}) {
      return {
        apiName: 'VConnectPublicApi',
        apiVersion: '1.0',
        requestID,
        messageType,
        timestamp: new Date().toISOString(),
        data
      };
    }

    setVconnectStatus(status, className) {
      this.emit('vconnectStatus', { status, className });
      const textEl = document.getElementById('vconnect-status-text');
      const divEl = document.getElementById('vconnect-status');
      if (textEl) textEl.textContent = status;
      if (divEl) {
        divEl.className = `status-box ${className}`;
        const indicator = divEl.querySelector('.status-indicator');
        if (indicator) indicator.className = `status-indicator ${className}`;
      }
    }

    setTikTokStatus(status, className) {
      this.emit('tiktokStatus', { status, className });
      const textEl = document.getElementById('tiktok-status-text');
      const divEl = document.getElementById('tiktok-status');
      if (textEl) textEl.textContent = status;
      if (divEl) {
        divEl.className = `status-box ${className}`;
        const indicator = divEl.querySelector('.status-indicator');
        if (indicator) indicator.className = `status-indicator ${className}`;
      }
    }

    getTriggers() {
      return this.triggers.slice();
    }

    getGiftMappings() {
      return new Map(this.giftMappings);
    }

    getLikeMappings() {
      return this.likeMappings.slice();
    }

    getTriggerName(uid) {
      const trigger = this.triggers.find(t => t.uid === uid);
      return trigger ? trigger.name : uid;
    }

    findGiftTriggerCaseInsensitive(incomingGiftName) {
      const lowerIncomingName = incomingGiftName.toLowerCase();
      for (const [mappedGiftName, triggerId] of this.giftMappings) {
        if (mappedGiftName.toLowerCase() === lowerIncomingName) {
          return triggerId;
        }
      }
      return null;
    }

    disconnectVConnect() {
      if (this.vconnectSocket) {
        this.vconnectSocket.onclose = null;
        this.vconnectSocket.close();
        this.vconnectSocket = null;
      }
      this.setVconnectStatus('Disconnected', 'disconnected');
      this.log('VConnect manually disconnected');
    }

    disconnectTikTok() {
      if (this.tiktokSocket) {
        this.tiktokSocket.onclose = null;
        this.tiktokSocket.close();
        this.tiktokSocket = null;
      }
      this.setTikTokStatus('Disconnected', 'disconnected');
      this.log('TikTok manually disconnected');
    }

    connectVConnect() {
      if (this.vconnectSocket && this.vconnectSocket.readyState === WebSocket.OPEN) {
        this.log('VConnect WebSocket is already connected');
        return;
      }

      try {
        this.setVconnectStatus('Connecting...', 'connecting');
        this.vconnectSocket = new WebSocket(this.vconnectUrl);

        this.vconnectSocket.onopen = () => {
          this.setVconnectStatus('Connected', 'connected');
          this.log('VConnect WebSocket connection established');
          this.requestTriggerList();
        };

        this.vconnectSocket.onmessage = (event) => {
          this.handleVConnectMessage(event);
        };

        this.vconnectSocket.onclose = () => {
          this.setVconnectStatus('Disconnected', 'disconnected');
          this.log('VConnect Connection lost. Retrying in 30 seconds...');
          setTimeout(() => this.connectVConnect(), RETRY_DELAY);
        };

        this.vconnectSocket.onerror = () => {
          this.setVconnectStatus('Error', 'disconnected');
          this.log('VConnect WebSocket error', true);
        };
      } catch (e) {
        this.setVconnectStatus('Error', 'disconnected');
        this.log(`Failed to create VConnect WebSocket: ${e.message}`, true);
        setTimeout(() => this.connectVConnect(), RETRY_DELAY);
      }
    }

    handleVConnectMessage(event) {
      this.log(`Received from VConnect: ${event.data}`);
      try {
        const jsonData = JSON.parse(event.data);
        const messageType = jsonData.messageType;

        if (messageType === 'TriggerListResponse') {
          const rawTriggers = (jsonData.data && jsonData.data.triggers) || [];
          this.triggers = rawTriggers.map(trigger => ({
            uid: trigger.uid,
            name: trigger.name,
            enabled: trigger.enabled,
            nodeCount: trigger.nodeCount
          }));
          this._config.triggers = this.triggers;
          this._config.lastUpdated = new Date().toISOString();
          this.saveConfig();
          this.syncTriggerUi();
          this.emit('triggersLoaded', this.triggers);
        } else if (messageType === 'TriggerActivateResponse') {
          const data = jsonData.data || {};
          this.emit('triggerActivated', data);
          this.log(`Trigger activation response: ${data.name || data.uid} success=${data.success}${data.error ? ` error=${data.error}` : ''}`);
        } else if (messageType === 'TriggerActivatedEvent') {
          const data = jsonData.data || {};
          this.emit('triggerStarted', data);
          this.log(`Trigger started: ${data.name || data.uid}`);
        } else if (messageType === 'TriggerEndedEvent') {
          const data = jsonData.data || {};
          this.emit('triggerEnded', data);
          this.log(`Trigger ended: ${data.name || data.uid} success=${data.success}${data.error ? ` error=${data.error}` : ''}`);
        } else if (messageType === 'ErrorResponse') {
          const message = (jsonData.data && jsonData.data.message) || 'Unknown VConnect error';
          this.log(`VConnect error: ${message}`, true);
          this.emit('vconnectError', jsonData.data);
        } else {
          this.emit('vconnectMessage', jsonData);
        }
      } catch (e) {
        this.log(`Error parsing VConnect message: ${e.message}`, true);
      }
    }

    requestTriggerList() {
      if (!this.vconnectSocket || this.vconnectSocket.readyState !== WebSocket.OPEN) {
        this.log('VConnect WebSocket is not connected', true);
        return false;
      }
      const message = this.vconnectEnvelope('TriggerListRequest', this.nextRequestId());
      this.vconnectSocket.send(JSON.stringify(message));
      this.log(`Sent to VConnect: ${JSON.stringify(message)}`);
      return true;
    }

    sendTrigger(triggerId) {
      if (triggerId == null) return;
      if (!this.vconnectSocket || this.vconnectSocket.readyState !== WebSocket.OPEN) {
        this.log('VConnect WebSocket is not connected', true);
        return false;
      }

      const trigger = this.triggers.find(t => t.uid === triggerId);
      const message = this.vconnectEnvelope('TriggerActivateRequest', this.nextRequestId(), {
        uid: triggerId
      });

      if (trigger) message.data.name = trigger.name;

      this.vconnectSocket.send(JSON.stringify(message));
      this.log(`Sent trigger activation: ${triggerId}`);
      this.emit('triggerFired', { uid: triggerId, name: trigger ? trigger.name : triggerId });
      return true;
    }

    connectTikTok() {
      if (this.tiktokSocket && this.tiktokSocket.readyState === WebSocket.OPEN) {
        this.log('TikTok WebSocket is already connected');
        return;
      }

      if (this.tiktokSocket) {
        this.tiktokSocket.close();
      }

      try {
        this.setTikTokStatus('Connecting...', 'connecting');
        this.tiktokSocket = new WebSocket(this.tiktokUrl);

        this.tiktokSocket.onopen = () => {
          this.setTikTokStatus('Connected', 'connected');
          this.log('TikTok WebSocket connection established');
          this.tiktokReconnectAttempts = 0;
          this.saveConfig();
        };

        this.tiktokSocket.onmessage = (event) => {
          this.handleTikTokMessage(event);
        };

        this.tiktokSocket.onclose = () => {
          this.setTikTokStatus('Disconnected', 'disconnected');
          this.log('TikTok Connection closed. Attempting to reconnect...');
          this.tiktokReconnectAttempts++;
          const backoffDelay = Math.min(30000, TIKTOK_RETRY_DELAY * Math.pow(1.5, this.tiktokReconnectAttempts - 1));
          this.log(`Will retry TikTok connection in ${Math.round(backoffDelay / 1000)} seconds...`);
          setTimeout(() => this.connectTikTok(), backoffDelay);
        };

        this.tiktokSocket.onerror = () => {
          this.setTikTokStatus('Error', 'disconnected');
          this.log('TikTok WebSocket error', true);
        };
      } catch (e) {
        this.setTikTokStatus('Error', 'disconnected');
        this.log(`Failed to create TikTok WebSocket: ${e.message}`, true);
        this.tiktokReconnectAttempts++;
        const backoffDelay = Math.min(30000, TIKTOK_RETRY_DELAY * Math.pow(1.5, this.tiktokReconnectAttempts - 1));
        setTimeout(() => this.connectTikTok(), backoffDelay);
      }
    }

    handleTikTokMessage(event) {
      try {
        const jsonData = JSON.parse(event.data);

        if (jsonData.event === 'gift') {
          this.handleTikTokGift(jsonData.data);
        } else if (jsonData.event === 'subscribe') {
          this.handleTikTokSubscribe(jsonData.data);
        } else if (jsonData.event === 'follow') {
          this.handleTikTokFollow(jsonData.data);
        } else if (jsonData.event === 'like') {
          this.handleTikTokLike(jsonData.data);
        } else if (jsonData.event === 'comment' || jsonData.event === 'chat') {
          this.handleTikTokComment(jsonData.data);
        }
      } catch (e) {
        this.log(`Error parsing TikTok message: ${e.message}`, true);
      }
    }

    handleTikTokComment(commentData) {
      const message = (commentData.comment || commentData.message || '').toString();
      const shortMessage = message.length > 60 ? `${message.slice(0, 57)}...` : message;
      this.log(`TikTok Comment: ${commentData.nickname} (${commentData.uniqueId}): ${shortMessage}`);
      this.emit('comment', commentData);
    }

    handleTikTokGift(giftData) {
      this.log(`TikTok Gift: ${giftData.nickname} sent ${giftData.giftName} x${giftData.repeatCount}`);
      this.emit('gift', giftData);

      this.setText('lastGiftName', giftData.giftName);
      this.setText('lastGiftSender', giftData.nickname);
      this.setText('lastGiftCount', giftData.repeatCount);
      this.setText('lastGiftValue', giftData.diamondCount * giftData.repeatCount);
      if (giftData.giftPictureUrl) {
        this.setHtml('lastGiftImage', `<img src="${giftData.giftPictureUrl}" alt="${giftData.giftName}" class="gift-img">`);
      }

      const triggerId = this.findGiftTriggerCaseInsensitive(giftData.giftName);
      if (triggerId) {
        this.sendTrigger(triggerId);
        this.log(`Mapped gift "${giftData.giftName}" to trigger ${triggerId}`);
      }
    }

    handleTikTokSubscribe(subscribeData) {
      this.log(`TikTok Subscribe: ${subscribeData.nickname} (${subscribeData.uniqueId}) subscribed for ${subscribeData.subMonth} months`);
      this.emit('subscribe', subscribeData);

      this.setText('lastSubscriberName', subscribeData.uniqueId);
      this.setText('lastSubscriberNickname', subscribeData.nickname);
      this.setText('lastSubscribeMonths', subscribeData.subMonth);
      this.setText('lastSubscribeTime', new Date().toLocaleTimeString());
      if (subscribeData.profilePictureUrl) {
        this.setHtml('lastSubscriberImage', `<img src="${subscribeData.profilePictureUrl}" alt="${subscribeData.nickname}" class="profile-img">`);
      }

      if (this.subscribeUid) {
        this.sendTrigger(this.subscribeUid);
        this.log(`Triggered subscribe event with trigger ${this.subscribeUid}`);
      }
    }

    handleTikTokFollow(followData) {
      this.log(`TikTok Follow: ${followData.nickname} (${followData.uniqueId}) followed`);
      this.emit('follow', followData);

      this.setText('lastFollowerName', followData.uniqueId);
      this.setText('lastFollowerNickname', followData.nickname);
      this.setText('lastFollowTime', new Date().toLocaleTimeString());
      if (followData.profilePictureUrl) {
        this.setHtml('lastFollowerImage', `<img src="${followData.profilePictureUrl}" alt="${followData.nickname}" class="profile-img">`);
      }

      if (this.followUid) {
        this.sendTrigger(this.followUid);
        this.log(`Triggered follow event with trigger ${this.followUid}`);
      }
    }

    handleTikTokLike(likeData) {
      const userId = likeData.userId;
      const likeCount = parseInt(likeData.likeCount);

      if (!this.userLikeTotals.has(userId)) {
        this.userLikeTotals.set(userId, 0);
        this.triggeredLikeGoals.set(userId, new Set());
      }
      this.userNicknames.set(userId, likeData.nickname);

      const previousTotal = this.userLikeTotals.get(userId);
      const newTotal = previousTotal + likeCount;
      this.userLikeTotals.set(userId, newTotal);

      this.setText('lastLikerName', likeData.uniqueId);
      this.setText('lastLikerNickname', likeData.nickname);
      this.setText('lastLikeCount', likeCount);
      this.setText('userTotalLikes', newTotal);
      this.setText('totalLikeCount', likeData.totalLikeCount);
      if (likeData.profilePictureUrl) {
        this.setHtml('lastLikerImage', `<img src="${likeData.profilePictureUrl}" alt="${likeData.nickname}" class="profile-img">`);
      }

      this.log(`TikTok Like: ${likeData.nickname} (${likeData.uniqueId}) sent ${likeCount} likes, total: ${newTotal}`);
      this.log(`Like mappings: ${JSON.stringify(this.likeMappings)}`);

      const userTriggeredGoals = this.triggeredLikeGoals.get(userId);
      this.log(`User triggered goals: ${Array.from(userTriggeredGoals || []).join(', ')}`);

      this.updateLikeTrackingStats();

      for (const mapping of this.likeMappings) {
        const threshold = mapping.likeCount;
        this.log(`Checking like goal ${threshold}: user total=${newTotal}, previous=${previousTotal}, already triggered=${userTriggeredGoals ? userTriggeredGoals.has(threshold) : 'N/A'}`);

        if (newTotal >= threshold && previousTotal < threshold &&
            userTriggeredGoals && !userTriggeredGoals.has(threshold)) {
          userTriggeredGoals.add(threshold);
          try {
            const triggerResult = this.sendTrigger(mapping.triggerId);
            this.log(`TRIGGER FIRED: User ${likeData.uniqueId} reached like goal ${threshold} (total: ${newTotal}), triggered ${mapping.triggerId}, result: ${triggerResult}`);
          } catch (e) {
            this.log(`Error sending trigger for like goal ${threshold}: ${e.message}`, true);
          }
        }
      }
    }

    updateLikeTrackingStats() {
      this.setText('usersTrackedCount', this.userLikeTotals.size);

      let topLikerUserId = null;
      let topLikerCount = 0;
      this.userLikeTotals.forEach((count, userId) => {
        if (count > topLikerCount) {
          topLikerCount = count;
          topLikerUserId = userId;
        }
      });

      const topLikerName = topLikerUserId ? (this.userNicknames.get(topLikerUserId) || topLikerUserId) : 'None';
      this.setText('topLikerName', topLikerName);
      this.setText('topLikerCount', topLikerCount);
      this.emit('likeStats', {
        usersTracked: this.userLikeTotals.size,
        topLikerName,
        topLikerCount
      });
    }

    clearLikeTracking() {
      const userCount = this.userLikeTotals.size;
      this.userLikeTotals.clear();
      this.userNicknames.clear();
      this.triggeredLikeGoals.clear();
      this.log(`Cleared like tracking data for ${userCount} users`);
      this.updateLikeTrackingStats();
    }

    addGiftMapping(giftName, triggerId) {
      if (!giftName || !triggerId) {
        this.log('Please provide both gift name and trigger', true);
        return false;
      }
      this.giftMappings.set(giftName, triggerId);
      this.syncGiftMappingUi();
      this.saveConfig();
      this.emit('mappingChanged', this.getGiftMappings());
      this.log(`Added mapping: ${giftName} -> ${triggerId} (case-insensitive matching enabled)`);
      return true;
    }

    removeGiftMapping(giftName) {
      this.giftMappings.delete(giftName);
      this.syncGiftMappingUi();
      this.saveConfig();
      this.emit('mappingChanged', this.getGiftMappings());
      this.log(`Removed mapping for gift: ${giftName}`);
    }

    setFollowUid(uid) {
      this.followUid = uid || null;
      if (this.followUid) {
        this.log(`Set follow event to trigger: ${this.followUid}`);
      } else {
        this.log('Follow trigger mapping cleared', true);
      }
      this.syncFollowMappingUi();
      this.saveConfig();
    }

    setSubscribeUid(uid) {
      this.subscribeUid = uid || null;
      if (this.subscribeUid) {
        this.log(`Set subscribe event to trigger: ${this.subscribeUid}`);
      } else {
        this.log('Subscribe trigger mapping cleared', true);
      }
      this.syncSubscribeMappingUi();
      this.saveConfig();
    }

    addLikeMapping(likeCount, uid) {
      likeCount = parseInt(likeCount);
      if (isNaN(likeCount) || likeCount <= 0 || !uid) {
        this.log('Please enter a valid like count and select a trigger', true);
        return false;
      }

      const existingIndex = this.likeMappings.findIndex(mapping => mapping.likeCount === likeCount);
      if (existingIndex >= 0) {
        this.likeMappings[existingIndex].triggerId = uid;
        this.log(`Updated like mapping: ${likeCount} likes -> ${uid}`);
      } else {
        this.likeMappings.push({ likeCount, triggerId: uid });
        this.log(`Added like mapping: ${likeCount} likes -> ${uid}`);
      }

      this.likeMappings.sort((a, b) => a.likeCount - b.likeCount);
      this.syncLikeMappingUi();
      this.saveConfig();
      return true;
    }

    removeLikeMapping(index) {
      if (index >= 0 && index < this.likeMappings.length) {
        const removed = this.likeMappings.splice(index, 1)[0];
        this.syncLikeMappingUi();
        this.saveConfig();
        this.log(`Removed mapping for ${removed.likeCount} likes`);
      }
    }

    loadConfig() {
      const savedConfig = localStorage.getItem(this.storageKey);
      if (!savedConfig) return;

      try {
        const loadedConfig = JSON.parse(savedConfig);
        this.triggers = loadedConfig.triggers || [];
        this._config.triggers = this.triggers;
        this._config.lastUpdated = loadedConfig.lastUpdated || null;

        if (loadedConfig.giftMappings) {
          this.giftMappings = new Map(Object.entries(loadedConfig.giftMappings));
        }
        if (loadedConfig.followUid) {
          this.followUid = loadedConfig.followUid;
        }
        if (loadedConfig.subscribeUid) {
          this.subscribeUid = loadedConfig.subscribeUid;
        }
        if (loadedConfig.likeMappings) {
          this.likeMappings = loadedConfig.likeMappings || [];
          this.log(`Loaded ${this.likeMappings.length} like mappings from config`);
        } else {
          this.log('No like mappings found in saved config');
        }

        this.syncTriggerUi();
        this.syncGiftMappingUi();
        this.syncFollowMappingUi();
        this.syncSubscribeMappingUi();
        this.syncLikeMappingUi();
      } catch (error) {
        this.log(`Error loading saved config: ${error.message}`, true);
      }
    }

    saveConfig() {
      this._config.triggers = this.triggers;
      this._config.giftMappings = Object.fromEntries(this.giftMappings);
      this._config.followUid = this.followUid;
      this._config.subscribeUid = this.subscribeUid;
      this._config.likeMappings = this.likeMappings;
      this._config.lastUpdated = new Date().toISOString();
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this._config));
        this.log('Configuration saved');
      } catch (error) {
        this.log(`Error saving config: ${error.message}`, true);
      }
    }

    setText(elementId, text) {
      const element = document.getElementById(elementId);
      if (element) {
        element.textContent = text;
      }
    }

    setHtml(elementId, html) {
      const element = document.getElementById(elementId);
      if (element) {
        element.innerHTML = html;
      }
    }

    syncTriggerUi() {
      const tableBody = document.getElementById('triggerTableBody');
      if (tableBody) {
        tableBody.innerHTML = '';
        this.triggers.forEach(trigger => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${trigger.uid}</td>
            <td>${trigger.name}</td>
            <td>${trigger.enabled ? 'yes' : 'no'}</td>
          `;
          tableBody.appendChild(row);
        });
      }

      const giftTriggerSelect = document.getElementById('giftTriggerSelect');
      const followTriggerSelect = document.getElementById('followTriggerSelect');
      const likeTriggerSelect = document.getElementById('likeTriggerSelect');
      const subscribeTriggerSelect = document.getElementById('subscribeTriggerSelect');

      [giftTriggerSelect, followTriggerSelect, likeTriggerSelect, subscribeTriggerSelect].forEach(select => {
        if (!select) return;
        select.innerHTML = '<option value="">Select Trigger</option>';
        this.triggers.forEach(trigger => {
          const option = document.createElement('option');
          option.value = trigger.uid;
          option.textContent = trigger.name;
          select.appendChild(option);
        });
      });

      if (followTriggerSelect && this.followUid) followTriggerSelect.value = this.followUid;
      if (subscribeTriggerSelect && this.subscribeUid) subscribeTriggerSelect.value = this.subscribeUid;
    }

    syncGiftMappingUi() {
      const tbody = document.getElementById('giftMappingTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';
      this.giftMappings.forEach((uid, giftName) => {
        const triggerName = this.getTriggerName(uid);
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${giftName}</td>
          <td>${triggerName}</td>
          <td><button onclick="window.Tikfinity.removeGiftMapping('${giftName}')">Remove</button></td>
        `;
        tbody.appendChild(row);
      });
    }

    syncFollowMappingUi() {
      const infoDiv = document.getElementById('followMappingInfo');
      if (!infoDiv) return;
      if (!this.followUid) {
        infoDiv.innerHTML = 'No follow trigger set';
      } else {
        const triggerName = this.getTriggerName(this.followUid);
        infoDiv.innerHTML = `
          <div><strong>Trigger:</strong> ${triggerName} (UUID: ${this.followUid})</div>
          <button onclick="Tikfinity.setFollowUid(null)" style="margin-top: 10px;">Clear</button>
        `;
      }
    }

    syncSubscribeMappingUi() {
      const infoDiv = document.getElementById('subscribeMappingInfo');
      if (!infoDiv) return;
      if (!this.subscribeUid) {
        infoDiv.innerHTML = 'No subscribe trigger set';
      } else {
        const triggerName = this.getTriggerName(this.subscribeUid);
        infoDiv.innerHTML = `
          <div><strong>Trigger:</strong> ${triggerName} (UUID: ${this.subscribeUid})</div>
          <button onclick="Tikfinity.setSubscribeUid(null)" style="margin-top: 10px;">Clear</button>
        `;
      }
    }

    syncLikeMappingUi() {
      const tbody = document.getElementById('likeMappingTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';
      this.likeMappings.forEach((mapping, index) => {
        const triggerName = this.getTriggerName(mapping.triggerId);
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${mapping.likeCount}</td>
          <td>${triggerName}</td>
          <td><button onclick="Tikfinity.removeLikeMapping(${index})">Remove</button></td>
        `;
        tbody.appendChild(row);
      });
    }
}

export default TikfinitySystem;