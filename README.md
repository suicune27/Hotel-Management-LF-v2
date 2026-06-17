## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

## 📞 WebRTC Call Server

The hotel app includes a lightweight WebSocket signaling server for WebRTC voice calls between guests and the front desk. It replaces Supabase Realtime broadcast signaling when available, offering lower latency and direct peer-to-peer media.

### How it works

The call server runs on the **front desk machine**. When a guest calls the front desk:

1. The guest's browser connects to the server via WebSocket
2. The server relays offer/answer/ICE candidates between guest and front desk
3. Audio flows directly peer-to-peer via WebRTC (no media goes through the server)
4. If the server is unreachable, the app falls back to Supabase Realtime signaling automatically

### Starting the server

On the **front desk PC**, run:

```bash
npm run call-server
```

This starts the WebSocket server on **port 3001**. You should see:
```
[CallServer] Signaling server running on 0.0.0.0:3001
[CallServer] HTTP health check: http://localhost:3001/
[CallServer] WebSocket: ws://localhost:3001/
```

### Guest connection (hotel WiFi)

Guests on the hotel WiFi connect to the front desk machine's IP address automatically. The app tries to connect to `ws://<the-page-hostname>:3001` by default.

#### If guests are on the same machine (kiosk/testing):
- The default URL `ws://localhost:3001` works automatically
- No configuration needed

#### If guests are on separate devices (hotel WiFi):

1. **Find the front desk machine's local IP:**
   ```bash
   # On Windows:
   ipconfig
   # Look for "IPv4 Address" under your active network adapter, e.g. 192.168.1.42
   
   # On macOS/Linux:
   ip addr show | grep inet
   ```

2. The front desk machine must allow inbound connections on port **3001**:
   - Windows: You may see a firewall prompt when you start the server — click **Allow**
   - If no prompt, add a rule manually in **Windows Defender Firewall > Inbound Rules > New Rule** for port 3001
   - Hotel WiFi networks usually allow peer-to-peer traffic; enterprise guest networks may not

3. **Configure the server URL on guest devices** (optional, the app auto-detects):
   - The app auto-connects to the same hostname used to load the page
   - If the guest portal is loaded from `http://192.168.1.42:5173`, the call client tries `ws://192.168.1.42:3001`
   - If auto-connect fails, guests can manually enter the server URL in the front desk call panel settings

### Verifying the connection

On the front desk panel, a **WiFi indicator** shows connection status:
- 🟢 Connected — server is running and reachable
- 🔴 Disconnected — server is not running or unreachable; calls fall back to Supabase

You can also check the health endpoint in your browser:
```
http://<front-desk-ip>:3001/
```
Returns a JSON status:
```json
{"name":"Hotel Call Signaling Server","status":"running","frontDeskOnline":true,"activeCalls":0}
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_PORT` | `3001` | WebSocket server port |
| `WS_HOST` | `0.0.0.0` | Bind address (use `127.0.0.1` to restrict to localhost) |

### Troubleshooting

| Problem | Likely cause | Solution |
|---------|-------------|----------|
| Guest sees "Front desk is not available" | Server not running on front desk PC | Run `npm run call-server` |
| Guest cannot connect to server | Firewall blocking port 3001 | Open port 3001 in firewall |
| Audio doesn't work on guest device | Microphone permission denied | Check browser permission settings |
| Call connects but no audio | ICE negotiation failed on hotel WiFi | Ensure STUN servers are reachable; configure TURN servers in hotel settings (admin panel) |
| Server starts but shows "ws://0.0.0.0:3001" | Normal — `0.0.0.0` means it listens on all network interfaces | Use the machine's local IP (e.g., `192.168.1.x`) to connect from other devices |
| Calls fall back to Supabase | WebSocket connection failed | Check firewall, network, and that the server is running on the correct port |
