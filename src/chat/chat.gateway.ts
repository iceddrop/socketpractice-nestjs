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
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private rooms = new Map<string, Set<string>>();

  handleConnection(socket: Socket) {
    console.log('Client connected:', socket.id);
    socket.emit('welcome', 'Welcome to your secret chat server!');
  }

  handleDisconnect(socket: Socket) {
    console.log('Client disconnected:', socket.id);
    // Remove user from all rooms
    this.rooms.forEach((users, room) => {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        this.server.to(room).emit('message', {
          author: 'System',
          text: `User ${socket.id} left the room`,
        });
      }
    });
  }

  @SubscribeMessage('join')
  handleJoin(socket: Socket, room: string) {
    if (!room) return;

    // Add user to room tracking
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)?.add(socket.id);

    // Join socket.io room
    socket.join(room);
    console.log(`${socket.id} joined ${room}`);

    // Notify room
    socket.to(room).emit('message', {
      author: 'System',
      text: `User ${socket.id} joined the room`,
    });

    // Confirm to joiner
    socket.emit('message', {
      author: 'System',
      text: `You joined ${room}`,
    });
  }

  @SubscribeMessage('message')
  handleMessage(
    socket: Socket,
    payload: { room: string; author: string; text: string },
  ) {
    console.log('Message received:', JSON.stringify(payload, null, 2));

    if (!payload?.room) {
      console.log('Invalid message - no room specified');
      return;
    }

    // Send the actual payload object, not a string
    this.server.to(payload.room).emit('message', {
      author: payload.author,
      text: payload.text,
      room: payload.room,
    });
  }
}
