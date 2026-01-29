// XRPL WebSocket client management

import { Client } from "xrpl";
import { NETWORK_URLS, SUPPORTED_NETWORKS, type XrplNetwork } from "./constants.js";

const clients = new Map<XrplNetwork, Client>();

/** Get the connected client for a network, or undefined if not connected */
export function getClient(network: XrplNetwork): Client | undefined {
  const client = clients.get(network);
  if (client?.isConnected()) return client;
  return undefined;
}

/** Connect to configured XRPL networks */
export async function connectClient(
  networks: XrplNetwork[] = SUPPORTED_NETWORKS,
): Promise<void> {
  for (const network of networks) {
    const url = NETWORK_URLS[network];
    const client = new Client(url);

    client.on("disconnected", () => {
      console.log(`XRPL client disconnected from ${network}, reconnecting...`);
      setTimeout(() => {
        client.connect().catch((err) => {
          console.error(`XRPL reconnect failed for ${network}:`, err);
        });
      }, 2000);
    });

    await client.connect();
    clients.set(network, client);
    console.log(`XRPL client connected to ${network} (${url})`);
  }
}

/** Disconnect all XRPL clients */
export async function disconnectClient(): Promise<void> {
  for (const [network, client] of clients) {
    if (client.isConnected()) {
      // Remove disconnect handler to prevent reconnect on intentional shutdown
      client.removeAllListeners("disconnected");
      await client.disconnect();
      console.log(`XRPL client disconnected from ${network}`);
    }
  }
  clients.clear();
}
