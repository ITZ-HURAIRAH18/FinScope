import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { prisma } from './prisma';
import bcrypt from 'bcryptjs';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials');
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email,
          },
        });

        if (!user || !user.password) {
          throw new Error('Invalid credentials');
        }

        const isCorrectPassword = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isCorrectPassword) {
          throw new Error('Invalid credentials');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  pages: {
    signIn: '/auth/login',
    signOut: '/auth/login',
    error: '/auth/login',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      // Initial sign in - only store essential data (no image to keep token small)
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }

      // Handle session update trigger (when profile is updated)
      if (trigger === "update") {
        // Fetch fresh user data from database
        const updatedUser = await prisma.user.findUnique({
          where: { email: token.email as string },
          select: { id: true, email: true, name: true },
        });

        if (updatedUser) {
          token.name = updatedUser.name;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        try {
          // Fetch user data including image from database
          // This avoids storing large base64 images in the JWT token
          const user = await prisma.user.findUnique({
            where: { email: token.email as string },
            select: { id: true, email: true, name: true, image: true },
          });

          if (user) {
            session.user.id = user.id;
            session.user.email = user.email;
            session.user.name = user.name;
            session.user.image = user.image;
          } else {
            // Fallback to token data if user not found
            session.user.id = token.id as string;
            session.user.email = token.email as string;
            session.user.name = token.name as string;
          }
        } catch (error) {
          // If database is unavailable, use token data as fallback
          console.error('Database error in session callback:', error);
          session.user.id = token.id as string;
          session.user.email = token.email as string;
          session.user.name = token.name as string;
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};
