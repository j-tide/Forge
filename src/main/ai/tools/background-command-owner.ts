interface BackgroundCommand {
  /** Resolves after the process and its stdio have closed. */
  closed: Promise<void>;
  stop: () => void;
}

/** Owns background commands for one Worker, including its intermediate sessions. */
export class BackgroundCommandOwner {
  private commands = new Set<BackgroundCommand>();
  private closing = false;
  private shutdown: Promise<void> | undefined;

  start<T extends BackgroundCommand>(spawn: () => T): T {
    if (this.closing) throw new Error('Background command owner is closed');
    const command = spawn();
    this.commands.add(command);
    void command.closed.then(() => this.commands.delete(command), () => {
      // Keep failed cleanup visible to the final shutdown.
    });
    return command;
  }

  close(): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.closing = true;
    const commands = [...this.commands];
    this.shutdown = (async () => {
      for (const command of commands) command.stop();
      await Promise.all(commands.map(command => command.closed));
    })();
    return this.shutdown;
  }
}
