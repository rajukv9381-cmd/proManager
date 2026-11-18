import { initials } from '../../utils/initials.js';

export default function TeamChat({ messages, message, onMessageChange, onSend }) {
  return <>
    <div className="section-title"><div><h2>Team chat</h2><p>Keep the conversation close to the work.</p></div><span className="live-tag">● Live</span></div>
    <section className="panel chat-panel"><div className="messages">{messages.length ? messages.map(m => <div className="message" key={m.id}><span className="avatar small">{initials(m.author_name)}</span><div><div><strong>{m.author_name}</strong> <time>{new Date(m.created_at).toLocaleString()}</time></div><p>{m.body}</p></div></div>) : <div className="empty-state">No messages yet. Start the conversation!</div>}</div><form className="inline-form message-form" onSubmit={onSend}><input required maxLength={2000} value={message} onChange={e => onMessageChange(e.target.value)} placeholder="Write a message..." /><button className="primary">Send</button></form></section>
  </>;
}
