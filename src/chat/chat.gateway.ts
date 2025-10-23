import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface UserInfo {
  id: string;
  name?: string;
}

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

  // room -> set of socket ids
  private rooms = new Map<string, Set<string>>();
  // socketId -> user info
  private users = new Map<string, UserInfo>();

  handleConnection(socket: Socket) {
    console.log('Client connected:', socket.id);
    // send welcome
    socket.emit('welcome', 'Welcome to your secret chat server!');
    // broadcast updated users list (will include only registered users)
    this.broadcastUsers();
  }

  handleDisconnect(socket: Socket) {
    console.log('Client disconnected:', socket.id);

    // remove from tracked rooms
    this.rooms.forEach((set, room) => {
      if (set.delete(socket.id)) {
        this.server.to(room).emit('message', {
          room,
          author: 'System',
          text: `User ${socket.id} left the room`,
        });
        if (set.size === 0) this.rooms.delete(room);
      }
    });

    // remove user and broadcast updated list
    this.users.delete(socket.id);
    this.broadcastUsers();
  }

  // helper: emit current registered users to all clients
  private broadcastUsers() {
    const userList = Array.from(this.users.values()).map((u) => ({
      id: u.id,
      name: u.name || u.id,
    }));
    this.server.emit('users', userList);
  }

  // client: socket.emit('register-user', { name })
  @SubscribeMessage('register-user')
  handleRegisterUser(socket: Socket, payload: { name: string }) {
    if (!payload?.name) return;
    const info: UserInfo = { id: socket.id, name: payload.name };
    this.users.set(socket.id, info);
    // store name on socket for convenience
    socket.data.name = payload.name;
    console.log(`Registered user ${socket.id} as ${payload.name}`);
    this.broadcastUsers();
    // optional ack
    socket.emit('message', {
      author: 'System',
      text: `Registered as ${payload.name}`,
    });
  }

  // join can be invoked as socket.emit('join', 'roomName') OR socket.emit('join', { room, isPrivate })
  @SubscribeMessage('join')
  handleJoin(socket: Socket, payload: any) {
    let room: string | undefined;
    let isPrivate = false;

    if (typeof payload === 'string') {
      room = payload;
    } else if (payload && typeof payload === 'object') {
      room = payload.room;
      isPrivate = !!payload.isPrivate;
    }

    if (!room) return;

    if (!this.rooms.has(room)) this.rooms.set(room, new Set());
    this.rooms.get(room)!.add(socket.id);
    socket.join(room);
    console.log(`${socket.id} joined ${room} (private=${isPrivate})`);

    // notify others
    socket.to(room).emit('message', {
      room,
      author: 'System',
      text: `${socket.data.name || socket.id} joined the room`,
      isPrivate,
    });

    // confirm to joiner
    socket.emit('message', {
      room,
      author: 'System',
      text: `You joined ${room}`,
      isPrivate,
    });

    // Update users list for everyone (optional)
    this.broadcastUsers();
  }

  // create-private-chat: forward invite to target user
  // payload: { targetUserId, roomId }
  @SubscribeMessage('create-private-chat')
  handleCreatePrivateChat(
    socket: Socket,
    payload: { targetUserId: string; roomId: string },
  ) {
    if (!payload?.targetUserId || !payload?.roomId) return;
    const targetSocket = this.server.sockets.sockets.get(payload.targetUserId);
    const fromName = socket.data.name || socket.id;

    if (targetSocket) {
      targetSocket.emit('private-invite', {
        from: socket.id,
        fromName,
        roomId: payload.roomId,
      });
      // optional: notify creator that invite was sent
      socket.emit('message', {
        author: 'System',
        text: `Invite sent to ${payload.targetUserId}`,
        room: payload.roomId,
      });
    } else {
      socket.emit('message', {
        author: 'System',
        text: `User ${payload.targetUserId} not connected`,
      });
    }
  }

  // public or private messages
  @SubscribeMessage('message')
  handleMessage(
    socket: Socket,
    payload: {
      room?: string;
      author?: string;
      text?: string;
      isPrivate?: boolean;
    },
  ) {
    // validate
    if (!payload || !payload.room || !payload.text) {
      console.warn('Invalid message payload from', socket.id, payload);
      return;
    }

    const room = payload.room;
    const author = payload.author ?? socket.data.name ?? socket.id;
    const isPrivate = !!payload.isPrivate;

    // ensure room membership (optional)
    const members = this.rooms.get(room);
    if (!members || !members.has(socket.id)) {
      // If sender isn't tracked in room, still allow emit (useful for simple join semantics)
      console.warn(`Sender ${socket.id} not tracked in room ${room}`);
    }

    // emit object (do not stringify)
    this.server.to(room).emit('message', {
      room,
      author,
      text: payload.text,
      isPrivate,
    });
  }

  @SubscribeMessage('leave')
  handleLeave(socket: Socket, payload: { room?: string }) {
    const room = payload?.room;
    if (!room) return;

    // remove from room tracking
    const set = this.rooms.get(room);
    if (set && set.has(socket.id)) {
      set.delete(socket.id);
      socket.leave(room);
      this.server.to(room).emit('message', {
        room,
        author: 'System',
        text: `${socket.data?.name || socket.id} left the room`,
      });
      if (set.size === 0) this.rooms.delete(room);
    }
  }
}
