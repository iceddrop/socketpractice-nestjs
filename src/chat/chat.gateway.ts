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

  // Listen for "message" events from clients
  @SubscribeMessage('message')
  handleMessage(socket: Socket, message: string) {
    console.log('Message from client:', message);
    // Send a response back to all connected clients
    this.server.emit('message', `Server received: ${message}`);
  }

  // ADD THIS: Listen for "howdy" events (matching your React example)
  @SubscribeMessage('howdy')
  handleHowdy(socket: Socket, payload: string) {
    console.log('Received howdy:', payload);
    
    // Send 'hello' event back to the client
    socket.emit('hello', 'peace out');
  }
}