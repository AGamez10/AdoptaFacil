import { createServer, type Server, type Socket } from 'node:net';

export interface SinkMessage {
  from: string;
  to: string[];
  data: string;
}

/**
 * Minimal SMTP server for tests (a local "sandbox" mailbox): speaks enough of
 * RFC 5321 for nodemailer (EHLO, AUTH PLAIN, MAIL, RCPT, DATA, RSET, NOOP,
 * QUIT) and keeps every accepted message in memory. `reject` lets a test make
 * a recipient bounce with a permanent 550, like a real unknown mailbox.
 */
export class SmtpSink {
  readonly messages: SinkMessage[] = [];
  private server?: Server;
  private readonly sockets = new Set<Socket>();

  constructor(private readonly reject: (rcpt: string) => boolean = () => false) {}

  async start(): Promise<number> {
    this.server = createServer((socket) => this.handle(socket));
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    const address = this.server.address();
    return typeof address === 'object' && address ? address.port : 0;
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()) ?? resolve());
  }

  private handle(socket: Socket): void {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.setEncoding('utf8');
    let buffer = '';
    let inData = false;
    let current: SinkMessage = { from: '', to: [], data: '' };
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply('220 sink.test ESMTP');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) return;
          current.data = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          this.messages.push(current);
          current = { from: '', to: [], data: '' };
          reply('250 2.0.0 queued');
          continue;
        }
        const nl = buffer.indexOf('\r\n');
        if (nl === -1) return;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO') {
          reply('250-sink.test');
          reply('250-AUTH PLAIN');
          reply('250 8BITMIME');
        } else if (verb === 'HELO') reply('250 sink.test');
        else if (verb === 'AUTH') reply('235 2.7.0 ok');
        else if (verb === 'MAIL') {
          current = { from: line, to: [], data: '' };
          reply('250 2.1.0 ok');
        } else if (verb === 'RCPT') {
          const rcpt = /<([^>]*)>/.exec(line)?.[1] ?? '';
          if (this.reject(rcpt)) reply('550 5.1.1 mailbox unavailable');
          else {
            current.to.push(rcpt);
            reply('250 2.1.5 ok');
          }
        } else if (verb === 'DATA') {
          inData = true;
          reply('354 go ahead');
        } else if (verb === 'RSET' || verb === 'NOOP') reply('250 ok');
        else if (verb === 'QUIT') {
          reply('221 bye');
          socket.end();
        } else reply('502 not implemented');
      }
    });
  }
}
