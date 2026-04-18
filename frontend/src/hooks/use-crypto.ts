/**
 * Hook for crypto operations.
 */

import { useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { decryptMessage, type DecryptedMessage } from "@/lib/crypto";

export function useCrypto() {
  const privateKeyHex = useAuthStore((s) => s.privateKeyHex);

  const decrypt = useCallback(
    (encryptedBase64: string): DecryptedMessage | null => {
      if (!privateKeyHex) return null;
      try {
        return decryptMessage(privateKeyHex, encryptedBase64);
      } catch {
        return null;
      }
    },
    [privateKeyHex]
  );

  return { decrypt, isUnlocked: !!privateKeyHex };
}
