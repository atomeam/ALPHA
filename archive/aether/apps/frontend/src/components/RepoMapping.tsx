/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FolderGit2, 
  GitBranch, 
  GitPullRequest, 
  Star, 
  Search,
  Plus,
  X,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface Repo {
  id: string;
  name: string;
  fullName: string;
  description?: string;
  url: string;
  provider: 'github' | 'gitlab' | 'bitbucket' | 'local';
  defaultBranch: string;
  isPrivate: boolean;
  stars?: number;
  forks?: number;
  lastUpdated?: string;
}

interface RepoMappingProps {
  onRepoSelect?: (repo: Repo) => void;
  className?: string;
}

const mockGitHubRepos: Repo[] = [
  {
    id: '1',
    name: 'Aether',
    fullName: 'atomeam/Aether',
    description: 'ALPHA Stack monorepo',
    url: 'https://github.com/atomeam/Aether',
    provider: 'github',
    defaultBranch: 'main',
    isPrivate: false,
    stars: 0,
    forks: 0
  },
  {
    id: '2',
    name: 'openhands',
    fullName: 'OpenHands/openhands',
    description: 'AI software agent platform',
    url: 'https://github.com/OpenHands/openhands',
    provider: 'github',
    defaultBranch: 'main',
    isPrivate: false,
    stars: 25400,
    forks: 3200
  }
];

export function RepoMapping({ onRepoSelect, className }: RepoMappingProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [localRepos, setLocalRepos] = useState<Repo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [showAddLocal, setShowAddLocal] = useState(false);
  const [newLocalPath, setNewLocalPath] = useState('');

  const allRepos = [...mockGitHubRepos, ...localRepos];
  
  const filteredRepos = allRepos.filter(repo => {
    const matchesSearch = repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.fullName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProvider = selectedProvider === 'all' || repo.provider === selectedProvider;
    return matchesSearch && matchesProvider;
  });

  const handleAddLocalRepo = () => {
    if (!newLocalPath.trim()) return;
    
    const pathParts = newLocalPath.replace(/\\/g, '/').split('/');
    const name = pathParts[pathParts.length - 1] || 'local-repo';
    
    const newRepo: Repo = {
      id: Date.now().toString(),
      name,
      fullName: name,
      description: 'Local repository',
      url: newLocalPath,
      provider: 'local',
      defaultBranch: 'main',
      isPrivate: false
    };
    
    setLocalRepos([...localRepos, newRepo]);
    setNewLocalPath('');
    setShowAddLocal(false);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gold font-mono">Repository Mapping</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddLocal(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Add Local
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gold/10 hover:bg-gold/20 text-gold border border-gold/20 rounded-lg transition-colors">
            <RefreshCw size={14} />
            Sync
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          type="text"
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm placeholder:text-white/30 focus:outline-none focus:border-gold/30 transition-colors"
        />
      </div>

      {/* Provider Filters */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'github', 'gitlab', 'local'].map(provider => (
          <button
            key={provider}
            onClick={() => setSelectedProvider(provider)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
              selectedProvider === provider 
                ? "bg-gold/20 border-gold/40 text-gold"
                : "bg-white/5 border-white/10 text-white/60 hover:text-white/80"
            )}
          >
            {provider.charAt(0).toUpperCase() + provider.slice(1)}
          </button>
        ))}
      </div>

      {/* Repo List */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        <AnimatePresence>
          {filteredRepos.map(repo => (
            <motion.div
              key={repo.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              onClick={() => onRepoSelect?.(repo)}
              className="group p-3 bg-black/40 border border-white/5 hover:border-gold/30 rounded-xl cursor-pointer transition-all hover:bg-white/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FolderGit2 size={16} className="text-gold shrink-0" />
                    <span className="font-medium text-sm truncate">{repo.name}</span>
                    {repo.isPrivate && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-white/10 rounded">Private</span>
                    )}
                  </div>
                  <p className="text-xs text-white/50 truncate mt-0.5">{repo.fullName}</p>
                  {repo.description && (
                    <p className="text-xs text-white/40 truncate mt-1">{repo.description}</p>
                  )}
                </div>
                <ExternalLink size={14} className="text-white/30 group-hover:text-gold transition-colors" />
              </div>
              
              {/* Stats */}
              <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                <div className="flex items-center gap-1">
                  <GitBranch size={12} />
                  <span>{repo.defaultBranch}</span>
                </div>
                {repo.stars !== undefined && (
                  <div className="flex items-center gap-1">
                    <Star size={12} />
                    <span>{repo.stars.toLocaleString()}</span>
                  </div>
                )}
                {repo.forks !== undefined && (
                  <div className="flex items-center gap-1">
                    <GitPullRequest size={12} />
                    <span>{repo.forks.toLocaleString()}</span>
                  </div>
                )}
                <span className="ml-auto uppercase">{repo.provider}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {filteredRepos.length === 0 && (
          <div className="text-center py-8 text-white/30 text-sm">
            No repositories found
          </div>
        )}
      </div>

      {/* Add Local Modal */}
      <AnimatePresence>
        {showAddLocal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAddLocal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md p-5 bg-[#0a0a0a] border border-white/10 rounded-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold">Add Local Repository</h4>
                <button onClick={() => setShowAddLocal(false)} className="text-white/40 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              
              <p className="text-sm text-white/50 mb-4">
                Enter the absolute path to your local Git repository
              </p>
              
              <input
                type="text"
                placeholder="C:\Users\adamm\Projects\my-repo"
                value={newLocalPath}
                onChange={(e) => setNewLocalPath(e.target.value)}
                className="w-full px-4 py-3 bg-black/60 border border-white/10 rounded-xl text-sm placeholder:text-white/30 focus:outline-none focus:border-gold/30"
              />
              
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setShowAddLocal(false)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddLocalRepo}
                  disabled={!newLocalPath.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-gold hover:bg-gold/90 text-black rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add Repository
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}