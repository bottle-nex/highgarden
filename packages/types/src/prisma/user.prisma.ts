import type { Fill } from "./marketplace.prisma";

export interface User {
  id: string;
  name: string;
  email: string;
  image: string | null;
  walletAddress: string | null;

  fills?: Fill[];
}
