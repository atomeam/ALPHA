/**
 * Notifier
 * 
 * Slack/webhook notifications for alerts.
 */

import { EventEmitter } from 'events';

// Notification types
export type NotificationChannel = 'slack' | 'webhook' | 'email';

export interface Notification {
  id: string;
  channel: NotificationChannel;
  to: string; // webhook URL or channel name
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: number;
}

// Events
export const Events = {
  NOTIFICATION: 'notification',
} as const;

export class Notifier extends EventEmitter {
  private channels = new Map<string, { type: NotificationChannel; config: Record<string, string> }>();
  
  // Register a channel
  registerChannel(name: string, type: NotificationChannel, config: Record<string, string>) {
    this.channels.set(name, { type, config });
    this.emit('channelRegistered', { name, type });
  }
  
  // Send notification
  async notify(options: {
    channel?: string;
    message: string;
    severity?: Notification['severity'];
  }): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    const { channel = 'default', message, severity = 'info' } = options;
    
    const channelConfig = this.channels.get(channel);
    if (!channelConfig) {
      return { success: false, error: `Unknown channel: ${channel}` };
    }
    
    const notification: Notification = {
      id: crypto.randomUUID(),
      channel: channelConfig.type,
      to: channelConfig.config.url || '',
      message,
      severity,
      timestamp: Date.now(),
    };
    
    // In production, actually send
    // For now, emit event
    this.emit(Events.NOTIFICATION, notification);
    
    return { success: true, notificationId: notification.id };
  }
  
  // Send to multiple channels
  async broadcast(message: string, severity: Notification['severity'] = 'info') {
    const results = [];
    
    for (const [name, config] of this.channels) {
      const result = await this.notify({ channel: name, message, severity });
      results.push({ channel: name, ...result });
    }
    
    return results;
  }
  
  // List channels
  listChannels() {
    return Array.from(this.channels.keys());
  }
}

// Default instance
export const notifier = new Notifier();

// Helper: simple webhook POST
export async function sendWebhook(url: string, payload: unknown): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch {
    return false;
  }
}

import crypto from 'crypto';