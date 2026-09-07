'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  HeartCrack,
  KeyRound,
  Sliders,
  Terminal,
  Upload,
  Play,
  Square,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Info,
  Trash2
} from 'lucide-react';
import { LikedPostItem, instagramCodeToMediaId } from '@/lib/instagram';

type Tab = 'unlike' | 'account' | 'settings' | 'logs';

interface LogEntry {
  id: string;
  time: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('unlike');

  // Credentials
  const [sessionId, setSessionId] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [dsUserId, setDsUserId] = useState('');
  const [accountStatus, setAccountStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [accountStatusMsg, setAccountStatusMsg] = useState('');

  // Safety settings
  const [minDelay, setMinDelay] = useState(6);
  const [maxDelay, setMaxDelay] = useState(14);
  const [breakProbability, setBreakProbability] = useState(5); // 5%
  const [breakMin, setBreakMin] = useState(3); // minutes
  const [breakMax, setBreakMax] = useState(8); // minutes
  const [maxRetries, setMaxRetries] = useState(3);

  // Likes state
  const [likedItems, setLikedItems] = useState<LikedPostItem[]>([]);
  const [likesFileName, setLikesFileName] = useState('');
  const [isUnliking, setIsUnliking] = useState(false);
  const [unlikeProgress, setUnlikeProgress] = useState({ current: 0, total: 0, success: 0, errors: 0 });
  const [currentUnlikingUrl, setCurrentUnlikingUrl] = useState('');

  // Logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Abort controller ref
  const unlikeAbortRef = useRef<AbortController | null>(null);

  // Load credentials & settings from localStorage
  useEffect(() => {
    try {
      const savedSid = localStorage.getItem('insta_sid');
      const savedCsrf = localStorage.getItem('insta_csrf');
      const savedUid = localStorage.getItem('insta_uid');
      if (savedSid) setSessionId(savedSid);
      if (savedCsrf) setCsrfToken(savedCsrf);
      if (savedUid) setDsUserId(savedUid);

      const savedSettings = localStorage.getItem('insta_settings');
      if (savedSettings) {
        const s = JSON.parse(savedSettings);
        if (s.minDelay) setMinDelay(s.minDelay);
        if (s.maxDelay) setMaxDelay(s.maxDelay);
        if (s.breakProbability !== undefined) setBreakProbability(s.breakProbability);
        if (s.breakMin) setBreakMin(s.breakMin);
        if (s.breakMax) setBreakMax(s.breakMax);
        if (s.maxRetries) setMaxRetries(s.maxRetries);
      }
    } catch {
      // ignore
    }
  }, []);

  const addLog = (type: 'info' | 'success' | 'warning' | 'error', message: string) => {
    const time = new Date().toLocaleTimeString();
    const id = `${Date.now()}-${Math.random()}`;
    setLogs((prev) => [...prev.slice(-400), { id, time, type, message }]);
  };

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Save credentials
  const handleSaveCredentials = () => {
    try {
      localStorage.setItem('insta_sid', sessionId);
      localStorage.setItem('insta_csrf', csrfToken);
      localStorage.setItem('insta_uid', dsUserId);
      addLog('info', 'Instagram session credentials saved locally in browser.');
    } catch {
      // ignore
    }
  };

  // Test account validation
  const validateAccount = async () => {
    if (!sessionId) {
      setAccountStatus('invalid');
      setAccountStatusMsg('Please enter your sessionid cookie.');
      return;
    }

    setAccountStatus('validating');
    setAccountStatusMsg('Pinging Instagram Web API...');
    addLog('info', 'Verifying session validity with Instagram...');

    try {
      const res = await fetch('/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, csrfToken, dsUserId }),
      });
      const data = await res.json();

      if (data.ok) {
        setAccountStatus('valid');
        setAccountStatusMsg(data.message || 'Session is valid and ready!');
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken);
        }
        if (data.dsUserId) {
          setDsUserId(data.dsUserId);
        }
        addLog('success', `Instagram session confirmed! ${data.message || ''}`);
        try {
          localStorage.setItem('insta_sid', sessionId);
          if (data.csrfToken) localStorage.setItem('insta_csrf', data.csrfToken);
          if (data.dsUserId) localStorage.setItem('insta_uid', data.dsUserId);
        } catch {}
      } else {
        setAccountStatus('invalid');
        setAccountStatusMsg(data.message || 'Session validation failed.');
        addLog('error', `Session validation failed: ${data.message}`);
      }
    } catch (err: any) {
      setAccountStatus('invalid');
      setAccountStatusMsg(err.message || 'Network error');
      addLog('error', `Validation error: ${err.message}`);
    }
  };

  // Parse Liked Posts File (100% Client-Side: instantaneous, no file size limits)
  const handleLikesFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLikesFileName(file.name);
    addLog('info', `Reading file: ${file.name}...`);

    const reader = new FileReader();
    reader.onerror = () => {
      addLog('error', `Failed to read file: ${file.name}`);
    };
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch (jsonErr: any) {
          addLog('error', `Invalid JSON file format: ${jsonErr.message}`);
          return;
        }

        let rawLikes: any[] = [];
        if (Array.isArray(parsed)) {
          rawLikes = parsed;
        } else if (parsed && typeof parsed === 'object') {
          rawLikes = parsed.likes_media_likes || parsed.media_likes || [];
          if (rawLikes.length === 0) {
            // Find any array property that might contain likes
            for (const key of Object.keys(parsed)) {
              if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
                rawLikes = parsed[key];
                break;
              }
            }
          }
        }

        if (rawLikes.length === 0) {
          addLog('warning', `No liked posts found in ${file.name}. Please ensure this is the liked_posts.json file.`);
          return;
        }

        const items: LikedPostItem[] = [];
        for (let i = 0; i < rawLikes.length; i++) {
          const it = rawLikes[i];
          let href = '';
          let timestamp: number | undefined;

          if (Array.isArray(it.string_list_data) && it.string_list_data.length > 0) {
            href = it.string_list_data[0]?.href || '';
            timestamp = it.string_list_data[0]?.timestamp;
          } else if (typeof it.href === 'string') {
            href = it.href;
            timestamp = it.timestamp;
          } else if (typeof it.url === 'string') {
            href = it.url;
            timestamp = it.timestamp;
          }

          if (!href) continue;

          const match = href.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
          const shortcode = match ? match[1] : '';
          const mediaId = shortcode ? instagramCodeToMediaId(shortcode) : '';

          let dateStr = '';
          if (timestamp) {
            try {
              dateStr = new Date(timestamp * 1000).toLocaleString();
            } catch {
              // ignore
            }
          }

          items.push({
            id: `like-${i}-${shortcode || i}`,
            url: href,
            shortcode,
            mediaId,
            timestamp,
            dateStr,
            status: 'pending',
          });
        }

        if (items.length === 0) {
          addLog('warning', 'Found entries in the JSON file, but none contained valid Instagram post links.');
          return;
        }

        setLikedItems(items);
        setUnlikeProgress({ current: 0, total: items.length, success: 0, errors: 0 });
        addLog('success', `Parsed ${items.length} liked posts from ${file.name}`);
      } catch (err: any) {
        addLog('error', `Parsing error: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // Start Unlike Execution
  const startUnliking = async () => {
    if (!sessionId) {
      setActiveTab('account');
      addLog('warning', 'Please connect your session cookies in the Account tab first.');
      return;
    }

    const pendingItems = likedItems.filter((i) => i.status !== 'unliked');
    if (pendingItems.length === 0) {
      addLog('warning', 'No pending posts to unlike.');
      return;
    }

    setIsUnliking(true);
    addLog('info', `Starting bulk unlike for ${pendingItems.length} posts...`);

    const controller = new AbortController();
    unlikeAbortRef.current = controller;

    try {
      for (let i = 0; i < pendingItems.length; i++) {
      if (controller.signal.aborted) break;

      const item = pendingItems[i];
      setCurrentUnlikingUrl(item.url);
      setLikedItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'processing' } : it))
      );

      // Action delay before request
      const delay = Math.random() * (maxDelay - minDelay) + minDelay;
      await new Promise((r) => setTimeout(r, delay * 1000));
      if (controller.signal.aborted) break;

      let success = false;
      let errorMsg = '';

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch('/api/unlike/single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mediaId: item.mediaId,
              sessionId,
              csrfToken,
              dsUserId,
            }),
            signal: controller.signal,
          });
          const resData = await res.json();
          if (res.ok && resData.ok) {
            success = true;
            break;
          } else {
            errorMsg = resData.error || `HTTP ${res.status}`;
            if (attempt < maxRetries) {
              await new Promise((r) => setTimeout(r, 4000));
            }
          }
        } catch (e: any) {
          if (controller.signal.aborted) break;
          errorMsg = e.message || 'Network error';
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 4000));
          }
        }
      }

      if (success) {
        setUnlikeProgress((prev) => ({
          ...prev,
          current: prev.current + 1,
          success: prev.success + 1,
        }));
        setLikedItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'unliked' } : it))
        );
        addLog('success', `Unliked: ${item.url}`);
      } else {
        setUnlikeProgress((prev) => ({
          ...prev,
          current: prev.current + 1,
          errors: prev.errors + 1,
        }));
        setLikedItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'failed', error: errorMsg } : it))
        );
        addLog('error', `Failed to unlike ${item.url}: ${errorMsg}`);
      }

      // Check for cooldown break
      if (Math.random() < breakProbability / 100 && i < pendingItems.length - 1) {
        const breakSec = Math.round(Math.random() * (breakMax - breakMin) * 60 + breakMin * 60);
        addLog('warning', `☕ Cooldown break: Pausing for ${Math.round(breakSec / 60)} minutes to protect your account.`);
        await new Promise((r) => setTimeout(r, breakSec * 1000));
        addLog('info', 'Resuming unlike operations...');
      }
    }

    addLog('info', 'Finished processing batch.');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        addLog('error', `Unlike stream error: ${err.message}`);
      } else {
        addLog('warning', 'Unlike process stopped by user.');
      }
    } finally {
      setIsUnliking(false);
      unlikeAbortRef.current = null;
    }
  };

  const stopUnliking = () => {
    if (unlikeAbortRef.current) {
      unlikeAbortRef.current.abort();
      unlikeAbortRef.current = null;
    }
    setIsUnliking(false);
    addLog('warning', 'Stopping unlike process...');
  };

  return (
    <div className="min-h-screen bg-[#08090d] text-gray-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-gray-800/80 bg-[#0c0e14]/80 backdrop-blur sticky top-0 z-50 px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img
              src="/logo.png"
              alt="InstaClean Logo"
              className="w-10 h-10 rounded-xl object-cover shadow-lg border border-pink-500/20"
            />
            <div>
              <h1 className="font-bold text-base tracking-wide flex items-center gap-2">
                InstaClean
                <span className="text-[10px] uppercase font-semibold tracking-wider bg-pink-500/10 text-pink-400 px-2 py-0.5 rounded-full border border-pink-500/20">
                  Mass Unlike Tool
                </span>
              </h1>
              <p className="text-xs text-gray-400">Mass Unlike Instagram Reels & Posts</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Account Status Pill */}
            <div
              onClick={() => setActiveTab('account')}
              className="cursor-pointer flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium border bg-gray-900/60 transition hover:border-gray-600 border-gray-800"
            >
              {accountStatus === 'valid' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-400 font-semibold">{accountStatusMsg || 'Connected'}</span>
                </>
              ) : accountStatus === 'validating' ? (
                <>
                  <RefreshCw className="w-3 h-3 text-yellow-400 animate-spin" />
                  <span className="text-yellow-400">Verifying...</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-gray-300">Session Not Connected</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full px-6 py-6 flex-1 flex flex-col gap-6">
        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-gray-800 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('unlike')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'unlike'
                ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border border-pink-500/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <HeartCrack className="w-4 h-4" />
            Mass Unlike ({likedItems.length})
          </button>

          <button
            onClick={() => setActiveTab('account')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'account'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Account & Cookies
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'settings'
                ? 'bg-gray-800 text-gray-200 border border-gray-700'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Rate Limit & Safety
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'logs'
                ? 'bg-gray-800 text-gray-200 border border-gray-700'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Live Logs
            {logs.length > 0 && (
              <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full">
                {logs.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: UNLIKE POSTS */}
        {activeTab === 'unlike' && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 bg-[#0d1017] border border-gray-800/80 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                      <Upload className="w-4 h-4 text-pink-400" />
                      Upload Instagram Data: <code className="text-pink-400">liked_posts.json</code>
                    </h2>
                    {likesFileName && (
                      <span className="text-xs text-green-400 font-mono flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {likesFileName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mb-4">
                    Download your data from Instagram (Account Center &gt; Download your information &gt; Format: JSON).
                    Upload the extracted <code className="text-gray-300">liked_posts.json</code> file.
                  </p>
                </div>

                <label className="cursor-pointer border-2 border-dashed border-gray-700 hover:border-pink-500/50 rounded-xl p-6 text-center transition bg-[#090b10] hover:bg-gray-900/40">
                  <HeartCrack className="w-8 h-8 mx-auto mb-2 text-gray-500" />
                  <span className="text-sm font-medium text-gray-300 block">
                    Click to select or drag & drop <span className="text-pink-400">liked_posts.json</span>
                  </span>
                  <span className="text-xs text-gray-500 mt-1 block">Supports official Meta JSON export</span>
                  <input type="file" accept=".json" onChange={handleLikesFileUpload} className="hidden" />
                </label>
              </div>

              {/* Progress & Controls Card */}
              <div className="bg-[#0d1017] border border-gray-800/80 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-pink-400" />
                    Unlike Operations
                  </h3>

                  <div className="space-y-2 mb-4 text-xs">
                    <div className="flex justify-between text-gray-400">
                      <span>Total Loaded:</span>
                      <span className="font-semibold text-gray-200">{likedItems.length}</span>
                    </div>
                    <div className="flex justify-between text-green-400">
                      <span>Successfully Unliked:</span>
                      <span className="font-semibold">{unlikeProgress.success}</span>
                    </div>
                    <div className="flex justify-between text-red-400">
                      <span>Failed:</span>
                      <span className="font-semibold">{unlikeProgress.errors}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Remaining:</span>
                      <span className="font-semibold">
                        {Math.max(0, likedItems.length - unlikeProgress.success - unlikeProgress.errors)}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {likedItems.length > 0 && (
                    <div className="w-full bg-gray-800 rounded-full h-2 mb-3 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-pink-500 to-purple-500 h-full transition-all duration-300"
                        style={{
                          width: `${(unlikeProgress.current / (likedItems.length || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  )}

                  {currentUnlikingUrl && isUnliking && (
                    <p className="text-[11px] text-pink-400 truncate font-mono mb-3">
                      Processing: {currentUnlikingUrl}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {!isUnliking ? (
                    <button
                      onClick={startUnliking}
                      disabled={likedItems.length === 0}
                      className="w-full bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-40 text-white text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition"
                    >
                      <Play className="w-4 h-4" />
                      Start Mass Unlike
                    </button>
                  ) : (
                    <button
                      onClick={stopUnliking}
                      className="w-full bg-red-600/90 hover:bg-red-500 text-white text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition"
                    >
                      <Square className="w-4 h-4 fill-white" />
                      Stop Execution
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Posts Preview Table */}
            <div className="bg-[#0d1017] border border-gray-800/80 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Loaded Posts ({likedItems.length})
                </h3>
                {likedItems.length > 0 && (
                  <button
                    onClick={() => {
                      setLikedItems([]);
                      setLikesFileName('');
                    }}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear List
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {likedItems.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 text-xs">
                    Upload your <code className="text-gray-400">liked_posts.json</code> file to view and unlike posts.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-900/60 sticky top-0 text-gray-400 font-semibold border-b border-gray-800">
                      <tr>
                        <th className="py-2.5 px-4">#</th>
                        <th className="py-2.5 px-4">Post URL</th>
                        <th className="py-2.5 px-4">Shortcode</th>
                        <th className="py-2.5 px-4">Liked Date</th>
                        <th className="py-2.5 px-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60 font-mono text-[11px]">
                      {likedItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-gray-900/40 transition">
                          <td className="py-2 px-4 text-gray-500">{idx + 1}</td>
                          <td className="py-2 px-4 text-gray-300 max-w-xs truncate">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-pink-400 hover:underline flex items-center gap-1 inline-flex"
                            >
                              {item.url}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                          <td className="py-2 px-4 text-gray-400">{item.shortcode || '—'}</td>
                          <td className="py-2 px-4 text-gray-400">{item.dateStr || '—'}</td>
                          <td className="py-2 px-4 text-right">
                            {item.status === 'unliked' ? (
                              <span className="text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                                Unliked
                              </span>
                            ) : item.status === 'processing' ? (
                              <span className="text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20 animate-pulse">
                                Unliking...
                              </span>
                            ) : item.status === 'failed' ? (
                              <span
                                className="text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20"
                                title={item.error}
                              >
                                Failed
                              </span>
                            ) : (
                              <span className="text-gray-500">Pending</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ACCOUNT & COOKIES */}
        {activeTab === 'account' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#0d1017] border border-gray-800/80 rounded-2xl p-6">
              <h2 className="text-base font-semibold text-gray-200 mb-1 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-400" />
                Connect Instagram Session
              </h2>
              <p className="text-xs text-gray-400 mb-6">
                Using session cookies bypasses 2FA, SMS checkpoints, and automated password challenges.
                All tokens stay on your local machine.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    sessionid Cookie <span className="text-pink-400">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="e.g. 14830208305%3AF4d79cb8hSUBSo..."
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    csrftoken Cookie <span className="text-blue-400 font-normal text-[11px]">(Auto-detected if empty)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Leave empty to auto-detect, or paste manually"
                    value={csrfToken}
                    onChange={(e) => setCsrfToken(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    ds_user_id Cookie <span className="text-gray-500">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 14830208305"
                    value={dsUserId}
                    onChange={(e) => setDsUserId(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {accountStatusMsg && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                      accountStatus === 'valid'
                        ? 'bg-green-500/10 text-green-400 border-green-500/20'
                        : accountStatus === 'invalid'
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    }`}
                  >
                    {accountStatus === 'valid' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{accountStatusMsg}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={validateAccount}
                    disabled={accountStatus === 'validating'}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition"
                  >
                    {accountStatus === 'validating' ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    Test & Validate Session
                  </button>
                  <button
                    onClick={handleSaveCredentials}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold py-2.5 px-4 rounded-xl transition"
                  >
                    Save Locally
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Tutorial on Finding Cookies */}
            <div className="bg-[#0d1017] border border-gray-800/80 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-400" />
                  How to get your Instagram Cookies (30 seconds)
                </h3>
                <ol className="space-y-3 text-xs text-gray-300 list-decimal list-inside leading-relaxed">
                  <li>
                    Open your web browser (Chrome, Safari, Edge, Firefox) and log into{' '}
                    <a
                      href="https://www.instagram.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-pink-400 underline"
                    >
                      instagram.com
                    </a>
                    .
                  </li>
                  <li>
                    Right-click anywhere on the page and click <strong>Inspect</strong> (or press{' '}
                    <code className="bg-gray-800 px-1 py-0.5 rounded text-[11px]">F12</code> or{' '}
                    <code className="bg-gray-800 px-1 py-0.5 rounded text-[11px]">Cmd + Opt + I</code>).
                  </li>
                  <li>
                    Navigate to the <strong>Application</strong> tab (in Chrome/Edge) or <strong>Storage</strong> tab
                    (in Firefox/Safari).
                  </li>
                  <li>
                    Under <strong>Cookies</strong> on the left sidebar, click{' '}
                    <code className="text-pink-400">https://www.instagram.com</code>.
                  </li>
                  <li>
                    Find the rows named <code className="text-blue-400 font-bold">sessionid</code> and{' '}
                    <code className="text-blue-400 font-bold">csrftoken</code>, copy and paste them here!
                  </li>
                </ol>
              </div>

              <div className="mt-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Safe & Direct:</strong> All requests are sent directly to Instagram from your local machine.
                  Cookies never leave your computer.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SETTINGS & RATE LIMITING */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl bg-[#0d1017] border border-gray-800/80 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-gray-200 mb-1 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-gray-400" />
              Rate Limiting & Safety Parameters
            </h2>
            <p className="text-xs text-gray-400 mb-6">
              Adjust delays between requests to prevent Instagram from flagging or temporarily restricting actions.
            </p>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs font-semibold text-gray-300 mb-1.5">
                  <span>Action Delay Range</span>
                  <span className="text-pink-400 font-mono">
                    {minDelay}s – {maxDelay}s per action
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Min Delay (seconds)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={minDelay}
                      onChange={(e) => setMinDelay(Number(e.target.value))}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Max Delay (seconds)</label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={maxDelay}
                      onChange={(e) => setMaxDelay(Number(e.target.value))}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-pink-500"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  A random delay between Min and Max will be waited before each unlike action.
                </p>
              </div>

              <div className="border-t border-gray-800 pt-5">
                <div className="flex justify-between text-xs font-semibold text-gray-300 mb-1.5">
                  <span>Cooldown Breaks</span>
                  <span className="text-purple-400 font-mono">{breakProbability}% chance every item</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={25}
                  value={breakProbability}
                  onChange={(e) => setBreakProbability(Number(e.target.value))}
                  className="w-full accent-purple-500 mb-3"
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Break Min Duration (minutes)</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={breakMin}
                      onChange={(e) => setBreakMin(Number(e.target.value))}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Break Max Duration (minutes)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={breakMax}
                      onChange={(e) => setBreakMax(Number(e.target.value))}
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-5">
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Max Retries on Failure
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={maxRetries}
                  onChange={(e) => setMaxRetries(Number(e.target.value))}
                  className="w-32 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200"
                />
              </div>

              <button
                onClick={() => {
                  try {
                    localStorage.setItem(
                      'insta_settings',
                      JSON.stringify({ minDelay, maxDelay, breakProbability, breakMin, breakMax, maxRetries })
                    );
                    addLog('success', 'Settings saved.');
                  } catch {
                    // ignore
                  }
                }}
                className="bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold py-2.5 px-6 rounded-xl transition"
              >
                Save Settings
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: LIVE LOGS */}
        {activeTab === 'logs' && (
          <div className="bg-[#0c0e14] border border-gray-800/80 rounded-2xl p-5 flex flex-col flex-1 h-[500px]">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-3">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-pink-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                  Execution Terminal Stream
                </span>
              </div>
              <button
                onClick={() => setLogs([])}
                className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            </div>

            <div
              ref={logContainerRef}
              className="flex-1 overflow-y-auto space-y-1.5 font-mono text-xs pr-2 select-text"
            >
              {logs.length === 0 ? (
                <div className="text-gray-600 italic py-8 text-center">
                  No activity logged yet. Actions will stream here in real time.
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start space-x-2">
                    <span className="text-gray-500 select-none text-[10px] pt-0.5">{log.time}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                        log.type === 'success'
                          ? 'bg-green-500/20 text-green-400'
                          : log.type === 'error'
                          ? 'bg-red-500/20 text-red-400'
                          : log.type === 'warning'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {log.type}
                    </span>
                    <span
                      className={`flex-1 break-all ${
                        log.type === 'success'
                          ? 'text-green-300'
                          : log.type === 'error'
                          ? 'text-red-300'
                          : log.type === 'warning'
                          ? 'text-yellow-300'
                          : 'text-gray-300'
                      }`}
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/60 py-4 px-6 text-center text-xs text-gray-500">
        InstaClean • Local & Open-Source Social Privacy Management • Run locally on your Mac
      </footer>
    </div>
  );
}
