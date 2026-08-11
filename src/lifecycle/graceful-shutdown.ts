export type GracefulShutdownDependencies = {
    stopMaintenance(): void;
  
    closeServer():
      Promise<void>;
  
    closeDatabase():
      Promise<void>;
  };
  
  export function createGracefulShutdown(
    dependencies:
      GracefulShutdownDependencies,
  ): () => Promise<void> {
    let shutdownPromise:
      Promise<void> | null = null;
  
    return (): Promise<void> => {
      if (
        shutdownPromise !== null
      ) {
        return shutdownPromise;
      }
  
      shutdownPromise =
        performShutdown(
          dependencies,
        );
  
      return shutdownPromise;
    };
  }
  
  async function performShutdown(
    dependencies:
      GracefulShutdownDependencies,
  ): Promise<void> {
    let firstError:
      unknown | undefined;
  
    try {
      dependencies
        .stopMaintenance();
    } catch (
      error: unknown
    ) {
      firstError = error;
    }
  
    try {
      await dependencies
        .closeServer();
    } catch (
      error: unknown
    ) {
      if (
        firstError === undefined
      ) {
        firstError = error;
      } else {
        console.error(
          "Additional server shutdown error",
          error,
        );
      }
    }
  
    try {
      await dependencies
        .closeDatabase();
    } catch (
      error: unknown
    ) {
      if (
        firstError === undefined
      ) {
        firstError = error;
      } else {
        console.error(
          "Additional database shutdown error",
          error,
        );
      }
    }
  
    if (
      firstError !== undefined
    ) {
      throw firstError;
    }
  }