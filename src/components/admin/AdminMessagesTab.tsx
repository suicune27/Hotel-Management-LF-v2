import { useState } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '../../lib/supabase';
import { ContactMessage } from '../../types';
import { Mail, Eye, RefreshCw, Send } from 'lucide-react';
import type { ToastMessage } from '../Toast';

interface AdminMessagesTabProps {
  contactMessages: ContactMessage[];
  setContactMessages: React.Dispatch<React.SetStateAction<ContactMessage[]>>;
  loadDatabase: () => Promise<void>;
  addToast: (type: ToastMessage['type'], title: string, message: string) => void;
  triggerAlert?: (title: string, message: string) => void;
}

export default function AdminMessagesTab({
  contactMessages,
  setContactMessages,
  loadDatabase,
  addToast,
  triggerAlert,
}: AdminMessagesTabProps) {
  const [markingRead, setMarkingRead] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const handleMarkRead = async (msg: ContactMessage) => {
    setMarkingRead(msg.id);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('contact_messages')
        .update({ read_at: now })
        .eq('id', msg.id);

      if (error) throw error;

      setContactMessages(prev =>
        prev.map(m => (m.id === msg.id ? { ...m, read_at: now } : m))
      );
      addToast('success', 'Message Read', 'Marked as read.');
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Failed to mark as read');
    } finally {
      setMarkingRead(null);
    }
  };

  const handleContactReply = async (contactId: string, email: string, name: string, subject: string | null) => {
    if (!replyText.trim()) return;
    setSendingReply(true);
    try {
      const now = new Date().toISOString();
      await supabase.from('contact_messages').update({ admin_reply: replyText, replied_at: now }).eq('id', contactId);

      try {
        const url = supabaseUrl.replace(/\/rest\/v1\/?$/, '');
        await fetch(`${url}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
          body: JSON.stringify({
            to: email,
            subject: `Re: ${subject || 'Your inquiry'}`,
            html: `<p>Dear ${name},</p><p>${replyText.replace(/\n/g, '<br>')}</p><p>Best regards,<br>Hotel Management</p>`,
            from_name: 'Hotel Management'
          })
        });
      } catch (emailErr) {
        // Email failure is non-critical
      }

      loadDatabase();
      addToast('success', 'Reply Sent', `Reply sent to ${name}`);
      setReplyingTo(null);
      setReplyText('');
    } catch (err: any) {
      if (triggerAlert) {
        triggerAlert('Error', err.message);
      } else {
        addToast('error', 'Error', err.message);
      }
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-surface-900 tracking-tight">Guest Messages</h2>
          <p className="text-xs text-surface-400 mt-0.5">Contact inquiries submitted via the resort website.</p>
        </div>
        <button
          onClick={loadDatabase}
          className="px-3 py-2 bg-surface-100 hover:bg-surface-200 text-surface-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {contactMessages.length === 0 ? (
        <div className="bg-white rounded-2xl border border-surface-100 p-12 text-center max-w-sm mx-auto shadow-sm">
          <Mail className="w-10 h-10 text-surface-200 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-surface-700">No messages yet</h3>
          <p className="text-xs text-surface-400 mt-1">Guest inquiries from the contact form will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contactMessages.map((msg) => (
            <div
              key={msg.id}
              className={`bg-white rounded-2xl border p-5 shadow-sm transition-all ${
                !msg.read_at ? 'border-brand-200 bg-brand-50/20' : 'border-surface-100'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-surface-900 text-sm">{msg.name}</span>
                  {!msg.read_at && (
                    <span className="px-2 py-0.5 bg-brand-100 text-brand-700 text-[9px] font-bold uppercase rounded-full">New</span>
                  )}
                </div>
                <span className="text-[10px] text-surface-400 font-mono whitespace-nowrap">
                  {new Date(msg.created_at).toLocaleString()}
                </span>
              </div>
              <div className="flex gap-4 text-[11px] text-surface-500 mb-2">
                <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {msg.email}</span>
                {msg.phone && <span>{msg.phone}</span>}
              </div>
              {msg.subject && (
                <p className="text-xs font-semibold text-surface-700 mb-1">{msg.subject}</p>
              )}
              <p className="text-xs text-surface-600 leading-relaxed whitespace-pre-wrap">{msg.message}</p>

              {msg.admin_reply && (
                <div className="mt-3 pl-3 border-l-2 border-brand-300 bg-brand-50/30 rounded-r-lg p-3">
                  <p className="text-[10px] font-semibold text-brand-600 mb-1">Your Reply:</p>
                  <p className="text-xs text-surface-600 whitespace-pre-wrap">{msg.admin_reply}</p>
                  {msg.replied_at && (
                    <p className="text-[9px] text-surface-400 mt-1">{new Date(msg.replied_at).toLocaleString()}</p>
                  )}
                </div>
              )}

              {replyingTo === msg.id ? (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your reply..."
                    rows={3}
                    className="w-full text-xs p-2 border border-surface-200 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleContactReply(msg.id, msg.email, msg.name, msg.subject)}
                      disabled={sendingReply || !replyText.trim()}
                      className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" /> {sendingReply ? 'Sending...' : 'Send Reply'}
                    </button>
                    <button
                      onClick={() => { setReplyingTo(null); setReplyText(''); }}
                      disabled={sendingReply}
                      className="px-3 py-1.5 bg-surface-100 hover:bg-surface-200 text-surface-600 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  {!msg.read_at && (
                    <button
                      onClick={() => handleMarkRead(msg)}
                      disabled={markingRead === msg.id}
                      className="px-3 py-1.5 bg-surface-900 hover:bg-surface-800 text-white rounded-lg text-[10px] font-semibold cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {markingRead === msg.id ? 'Marking...' : 'Mark Read'}
                    </button>
                  )}
                  {msg.read_at && (
                    <span className="text-[10px] text-surface-400 flex items-center gap-1">
                      <Eye className="w-3 h-3" /> Read {new Date(msg.read_at).toLocaleString()}
                    </span>
                  )}
                  <button
                    onClick={() => { setReplyingTo(msg.id); setReplyText(''); }}
                    className="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg text-[10px] font-semibold cursor-pointer transition-colors ml-auto"
                  >
                    Reply
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
