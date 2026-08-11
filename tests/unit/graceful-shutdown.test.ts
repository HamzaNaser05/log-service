import {
    describe,
    expect,
    test,
  } from "vitest";
  
  import {
    createGracefulShutdown,
  } from "../../src/lifecycle/graceful-shutdown.js";
  
  describe(
    "graceful shutdown",
    () => {
      test(
        "stops maintenance, closes HTTP, then closes the database",
        async () => {
          const events:
            string[] = [];
  
          const shutdown =
            createGracefulShutdown({
              stopMaintenance:
                () => {
                  events.push(
                    "maintenance",
                  );
                },
  
              closeServer:
                async () => {
                  events.push(
                    "server",
                  );
                },
  
              closeDatabase:
                async () => {
                  events.push(
                    "database",
                  );
                },
            });
  
          const first =
            shutdown();
  
          const second =
            shutdown();
  
          expect(
            first,
          ).toBe(second);
  
          await first;
  
          expect(
            events,
          ).toEqual([
            "maintenance",
            "server",
            "database",
          ]);
        },
      );
  
      test(
        "still attempts database cleanup if server shutdown fails",
        async () => {
          const events:
            string[] = [];
  
          const originalError =
            new Error(
              "server close failed",
            );
  
          const shutdown =
            createGracefulShutdown({
              stopMaintenance:
                () => {
                  events.push(
                    "maintenance",
                  );
                },
  
              closeServer:
                async () => {
                  events.push(
                    "server",
                  );
  
                  throw originalError;
                },
  
              closeDatabase:
                async () => {
                  events.push(
                    "database",
                  );
                },
            });
  
          await expect(
            shutdown(),
          ).rejects.toBe(
            originalError,
          );
  
          expect(
            events,
          ).toEqual([
            "maintenance",
            "server",
            "database",
          ]);
        },
      );
    },
  );