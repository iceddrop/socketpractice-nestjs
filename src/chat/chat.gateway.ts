import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*', // allow any origin for testing
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // When a client connects
  handleConnection(socket: Socket) {
    console.log('A user connected:', socket.id);
    socket.emit('welcome', 'Hello from NestJS server!');
  }

  // When a client disconnects
  handleDisconnect(socket: Socket) {
    console.log('A user disconnected:', socket.id);
  }

    // client: socket.emit('join', 'roomName')
  @SubscribeMessage('join')
  handleJoin(socket: Socket, room: string) {
    if (!room) return;
    socket.join(room);
    console.log(`${socket.id} joined ${room}`);
    // notify room (excluding the joining socket)
    socket.to(room).emit('message', { author: 'System', text: `${socket.id} joined ${room}` });
    // confirm to the joining socket
    socket.emit('message', { author: 'System', text: `Joined ${room}` });
  }

  // client: socket.emit('message', { room, author, text })
  @SubscribeMessage('message')
  handleMessage(socket: Socket, payload: { room: string; author: string; text: string }) {
    console.log('Message from client:', payload);
    if (payload?.room) {
      // broadcast to everyone in the room
      this.server.to(payload.room).emit('message', { author: payload.author, text: payload.text });
    } else {
      // fallback: broadcast to all connected clients
      this.server.emit('message', { author: payload.author, text: payload.text });
    }
  }

  // ADD THIS: Listen for "howdy" events (matching your React example)
  @SubscribeMessage('howdy')
  handleHowdy(socket: Socket, payload: string) {
    console.log('Received howdy:', payload);
    
    // Send 'hello' event back to the client
    socket.emit('hello', 'peace out');
  }
}