import { prisma } from "@repo/database";

const users = await prisma.user.findMany();
console.log(`Connected. ${users.length} users.`);
