/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Key, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Copy,
  RefreshCw,
  Shield,
  Bot,
  Globe,
  Search
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface APIKeyConfig {
  id: string;
  name: string;
  provider: 'gemini' | 'openai' | 'anthropic' | 'tavily';
  key: string;
  isConfigured: boolean;
  lastVerified?: string;
  status: 'valid' | 'invalid' | 'pending' | 'missing';
}

interface APIKeyManagementProps {
  onKeySave?: (keys: APIKeyConfig[]) => void;
  className?: string;
}

const defaultKeys: APIKeyConfig[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    provider: 'gemini',
    key: '',
    isConfigured: false,
    status: 'missing'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    provider: 'openai',
    key: '',
    isConfigured: false,
    status: 'missing'
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    provider: 'anthropic',
    key: '',
    isConfigured: false,
    status: 'missing'
  },
  {
    id: 'tavily',
    name: 'Tavily Search',
    provider: 'tavily',
    key: '',
    isConfigured: false,
    status: 'missing'
  }
];

const providerIcons: Record<string, React.ReactNode> = {
  gemini: <Bot size={18} />,
  openai: <Bot size={18} />,
  anthropic: <Bot size={18} />,
  tavily: <Search size={18} />
};

export function APIKeyManagement({ onKeySave, className }: APIKeyManagementProps) {
  const [keys, setKeys] = useState<APIKeyConfig[]>(defaultKeys);
  const [showKey, setShowKey] = useState<Record<string, boolean>({});
  const [isVerifying, setIsVerifying] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = useState('');

  const handleToggleReveal = (id: string) => {
    setShowKey(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleVerify = async (keyId: string) => {
    setIsVerifying(keyId);
    
    // Simulate verification
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setKeys(prev => prev.map(k => 
      k.id === keyId 
        ? { ...k, status: 'valid' as const, lastVerified: new Date().toISOString() }
        : k
    ));
    
    setIsVerifying(null);
  };

  const handleSaveKey = (keyId: string) => {
    setKeys(prev => prev.map(k => 
      k.id === keyId 
        ? { ...k, key: newKeyValue, isConfigured: !!newKeyValue, status: newKeyValue ? 'valid' : 'missing' }
        : k
    ));
    setEditingKey(null);
    setNewKeyValue('');
    onKeySave?.(keys);
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
  };

  const configuredCount = keys.filter(k => k.isConfigured).length;
  const readyCount = keys.filter(k => k.status === 'valid').length;

  return (
    <div className={cn("space-y-5", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gold font-mono">API Key Management</h3>
          <p className="text-xs text-white/40 mt-1">
            {readyCount}/{keys.length} providers ready
          </p>
        </div>
        <Shield size={20} className="text-gold/60" />
      </div>

      {/* Status Bar */}
      <div className="grid grid-cols-4 gap-2">
        {keys.slice(0, 4).map(key => (
          <div 
            key={key.id}
            className={cn(
              "p-2 rounded-lg border text-center transition-colors",
              key.status === 'valid' 
                ? "bg-green-500/10 border-green-500/30" 
                : key.status === 'pending'
                ? "bg-yellow-500/10 border-yellow-500/30"
                : "bg-white/5 border-white/10"
            )}
          >
            <div className="text-xs font-medium">
              {key.status === 'valid' ? (
                <CheckCircle2 size={14} className="mx-auto text-green-400" />
              ) : key.status === 'pending' ? (
                <Loader2 size={14} className="mx-auto text-yellow-400 animate-spin" />
              ) : key.status === 'invalid' ? (
                <AlertCircle size={14} className="mx-auto text-red-400" />
              ) : (
                <AlertCircle size={14} className="mx-auto text-white/30" />
              )}
            </div>
            <div className="text-[10px] text-white/60 mt-1 capitalize">{key.provider}</div>
          </div>
        ))}
      </div>

      {/* Keys List */}
      <div className="space-y-3">
        <AnimatePresence>
          {keys.map(key => (
            <motion.div
              key={key.id}
              layout
              className="p-4 bg-black/40 border border-white/5 rounded-xl"
            >
              {editingKey === key.id ? (
                /* Edit Mode */
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {providerIcons[key.provider]}
                    <span className="font-medium">{key.name}</span>
                  </div>
                  <input
                    type="password"
                    placeholder="Enter API key..."
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm placeholder:text-white/30 focus:outline-none focus:border-gold/30"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingKey(null)}
                      className="flex-1 px-3 py-2 text-sm bg-white/5 hover:bg-white/10 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveKey(key.id)}
                      disabled={!newKeyValue}
                      className="flex-1 px-3 py-2 text-sm bg-gold hover:bg-gold/90 text-black rounded-lg disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      key.status === 'valid' ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/40"
                    )}>
                      {providerIcons[key.provider]}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{key.name}</div>
                      <div className="text-xs text-white/50">
                        {key.isConfigured 
                          ? (showKey[key.id] ? key.key : '••••••••••••••••') 
                          : 'Not configured'
                        }
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {key.status === 'valid' && (
                      <button
                        onClick={() => handleVerify(key.id)}
                        disabled={isVerifying === key.id}
                        className="p-2 text-white/40 hover:text-white transition-colors"
                        title="Verify"
                      >
                        <RefreshCw size={16} className={isVerifying === key.id ? "animate-spin" : ""} />
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleReveal(key.id)}
                      className="p-2 text-white/40 hover:text-white transition-colors"
                      title={showKey[key.id] ? "Hide" : "Show"}
                    >
                      {showKey[key.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    {key.isConfigured && (
                      <button
                        onClick={() => handleCopyKey(key.key)}
                        className="p-2 text-white/40 hover:text-white transition-colors"
                        title="Copy"
                      >
                        <Copy size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => setEditingKey(key.id)}
                      className="p-2 text-white/40 hover:text-gold transition-colors"
                      title="Edit"
                    >
                      <Key size={16} />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Provider Readiness Status */}
      <div className="p-4 bg-black/40 border border-white/5 rounded-xl">
        <h4 className="text-sm font-medium mb-3">Provider Readiness</h4>
        <div className="space-y-2">
          {keys.map(key => (
            <div key={key.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  key.status === 'valid' ? "bg-green-400" : "bg-white/20"
                )} />
                <span className="text-white/70">{key.name}</span>
              </div>
              <span className={cn(
                "text-xs",
                key.status === 'valid' ? "text-green-400" : "text-white/30"
              )}>
                {key.status === 'valid' ? 'Ready' : 'Not configured'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}