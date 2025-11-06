# LightTrails ✨

A real-time WebSocket application that allows multiple users to create and share light trails on a shared canvas. Built with Node.js and the `ws` library.

## Features

- 🎨 Real-time collaborative drawing using WebSocket
- 🌈 Customizable colors
- 📱 Mobile-friendly touch support
- 👥 Multi-client support with connection status
- ✨ Beautiful gradient UI with glassmorphism design
- 💓 Connection heartbeat monitoring (ping/pong)
- 🔄 Automatic reconnection on disconnect
- 🧹 Collaborative canvas clearing
- 🆔 Unique client identification

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## Installation

1. Install dependencies:
```bash
npm install
```

## Usage

1. Start the server:
```bash
npm start
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. Open multiple browser windows/tabs to see real-time collaboration in action!

## How It Works

- The server uses the `ws` library to maintain persistent WebSocket connections with all clients
- **Real-time Communication**: When you draw on the canvas, each point is sent to the server via WebSocket
- **Broadcasting**: The server broadcasts your trail to all other connected clients instantly
- **Connection Health**: Built-in heartbeat mechanism (ping/pong) keeps connections alive and detects dead connections
- **Client Tracking**: Each client gets a unique ID and connection metadata is tracked
- **Error Handling**: Robust error handling with automatic reconnection on client side
- Each client renders trails from all users in real-time

## Project Structure

```
LightTrails/
├── server.js          # WebSocket server and HTTP server
├── package.json       # Project dependencies
├── public/
│   ├── index.html    # Client HTML interface
│   └── client.js     # Client-side WebSocket logic
├── .gitignore        # Git ignore rules
└── README.md         # This file
```

## Customization

- **Port**: Change the `PORT` variable in `server.js` or set the `PORT` environment variable
- **Colors**: Modify the color picker default or add more preset colors in `client.js`
- **Trail size**: Adjust the radius in the `drawPoint` method in `client.js`

## License

MIT

