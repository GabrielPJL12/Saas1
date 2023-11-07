import type {
  NextApiRequest,
  NextApiResponse,
  GetServerSidePropsContext,
} from 'next';
import { Account, NextAuthOptions, Profile, User } from 'next-auth';
import BoxyHQSAMLProvider from 'next-auth/providers/boxyhq-saml';
import CredentialsProvider from 'next-auth/providers/credentials';
import EmailProvider from 'next-auth/providers/email';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import type { Provider } from 'next-auth/providers';
import { setCookie, getCookie } from 'cookies-next';
import { encode, decode } from 'next-auth/jwt';
import { v4 as uuidv4 } from 'uuid';

import { Role } from '@prisma/client';
import { getAccount } from 'models/account';
import { addTeamMember, getTeam } from 'models/team';
import { createUser, getUser } from 'models/user';
import { verifyPassword } from '@/lib/auth';
import { isBusinessEmail } from '@/lib/email/utils';
import env from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { isAuthProviderEnabled } from '@/lib/auth';
import { validateRecaptcha } from '@/lib/recaptcha';
import { sendMagicLink } from '@/lib/email/sendMagicLink';

const adapter = PrismaAdapter(prisma);
const providers: Provider[] = [];

if (isAuthProviderEnabled('credentials')) {
  providers.push(
    CredentialsProvider({
      id: 'credentials',
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
        recaptchaToken: { type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials) {
          throw new Error('no-credentials');
        }

        const { email, password, recaptchaToken } = credentials;

        await validateRecaptcha(recaptchaToken);

        if (!email || !password) {
          return null;
        }

        const user = await getUser({ email });

        if (!user) {
          throw new Error('invalid-credentials');
        }

        if (env.confirmEmail && !user.emailVerified) {
          throw new Error('confirm-your-email');
        }

        const hasValidPassword = await verifyPassword(
          password,
          user?.password as string
        );

        if (!hasValidPassword) {
          throw new Error('invalid-credentials');
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      },
    })
  );
}

if (isAuthProviderEnabled('github')) {
  providers.push(
    GitHubProvider({
      clientId: env.github.clientId,
      clientSecret: env.github.clientSecret,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

if (isAuthProviderEnabled('google')) {
  providers.push(
    GoogleProvider({
      clientId: env.google.clientId,
      clientSecret: env.google.clientSecret,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

if (isAuthProviderEnabled('saml')) {
  providers.push(
    BoxyHQSAMLProvider({
      authorization: { params: { scope: '' } },
      issuer: env.appUrl,
      clientId: 'dummy',
      clientSecret: 'dummy',
      allowDangerousEmailAccountLinking: true,
      httpOptions: {
        timeout: 30000,
      },
    })
  );
}

if (isAuthProviderEnabled('email')) {
  providers.push(
    EmailProvider({
      server: {
        host: env.smtp.host,
        port: env.smtp.port,
        auth: {
          user: env.smtp.user,
          pass: env.smtp.password,
        },
      },
      from: env.smtp.from,
      maxAge: 1 * 60 * 60, // 1 hour
      sendVerificationRequest: async ({ identifier, url }) => {
        await sendMagicLink(identifier, url);
      },
    })
  );
}

export const getAuthOptions = (
  req: NextApiRequest | GetServerSidePropsContext['req'],
  res: NextApiResponse | GetServerSidePropsContext['res']
) => {
  const authOptions: NextAuthOptions = {
    adapter,
    providers,
    pages: {
      signIn: '/auth/login',
      verifyRequest: '/auth/verify-request',
    },
    session: {
      strategy: env.nextAuth.sessionStrategy,
    },
    secret: env.nextAuth.secret,
    callbacks: {
      async signIn({ user, account, profile }) {
        // console.log({ user, account, profile });
        // console.log({ q: req.query.nextauth, url: req.url });

        if (!user || !user.email || !account) {
          return false;
        }

        if (env.disableNonBusinessEmailSignup && !isBusinessEmail(user.email)) {
          return '/auth/login?error=allow-only-work-email';
        }

        // Login via email and password
        if (
          req.query.nextauth?.includes('callback') &&
          req.query.nextauth.includes('credentials') &&
          req.method === 'POST'
        ) {
          const sessionToken = uuidv4();
          const sessionExpiry = 30 * 24 * 60 * 60;

          if (adapter.createSession) {
            console.log('Creating session');

            await adapter.createSession({
              sessionToken,
              userId: user.id,
              expires: fromDate(sessionExpiry),
            });
          }

          setCookie('next-auth.session-token', sessionToken, {
            req,
            res,
            expires: fromDate(sessionExpiry),
          });
        }

        // Login via email and password
        // if (account?.provider === 'credentials') {
        //   return true;
        // }

        const existingUser = await getUser({ email: user.email });

        // Login via email (Magic Link)
        if (account?.provider === 'email') {
          return existingUser ? true : false;
        }

        // First time users
        if (!existingUser) {
          const newUser = await createUser({
            name: `${user.name}`,
            email: `${user.email}`,
          });

          await linkAccount(newUser, account);

          if (account.provider === 'boxyhq-saml' && profile) {
            await linkToTeam(profile, newUser.id);
          }

          return true;
        }

        // Existing users reach here
        const linkedAccount = await getAccount({ userId: existingUser.id });

        if (!linkedAccount) {
          await linkAccount(existingUser, account);
        }

        return true;
      },

      async session({ session, token, user }) {
        // When using JWT for sessions, the JWT payload (token) is provided.
        // When using database sessions, the User (user) object is provided.

        // console.log({ session, token, user });

        if (session) {
          if (token) {
            session.user.id = token.sub as string;
          } else if (user) {
            session.user.id = user.id;
          }
        }

        return session;
      },

      async jwt({ token, trigger, session }) {
        if (trigger === 'update' && 'name' in session && session.name) {
          return { ...token, name: session.name };
        }

        return token;
      },
    },
    jwt: {
      encode: async (params) => {
        if (
          req.query.nextauth?.includes('callback') &&
          req.query.nextauth.includes('credentials') &&
          req.method === 'POST'
        ) {
          const cookie = getCookie('next-auth.session-token', { req, res });

          console.log({ cookie });

          if (cookie) {
            return cookie;
          }

          return '';
        }

        return encode(params);
      },
      decode: async (params) => {
        console.log({ Info: 'Before Decoding JWT' });

        if (
          req.query.nextauth?.includes('callback') &&
          req.query.nextauth.includes('credentials') &&
          req.method === 'POST'
        ) {
          console.log({ Info: 'After Decoding JWT' });
          return null;
        }

        return decode(params);
      },
    },
  };

  return authOptions;
};

const linkAccount = async (user: User, account: Account) => {
  if (adapter.linkAccount) {
    return await adapter.linkAccount({
      providerAccountId: account.providerAccountId,
      userId: user.id,
      provider: account.provider,
      type: 'oauth',
      scope: account.scope,
      token_type: account.token_type,
      access_token: account.access_token,
    });
  }
};

const linkToTeam = async (profile: Profile, userId: string) => {
  const team = await getTeam({
    id: profile.requested.tenant,
  });

  // Sort out roles
  const roles = profile.roles || profile.groups || [];
  let userRole: Role = team.defaultRole || Role.MEMBER;

  for (let role of roles) {
    if (env.groupPrefix) {
      role = role.replace(env.groupPrefix, '');
    }
    // Owner > Admin > Member
    if (
      role.toUpperCase() === Role.ADMIN &&
      userRole.toUpperCase() !== Role.OWNER.toUpperCase()
    ) {
      userRole = Role.ADMIN;
      continue;
    }
    if (role.toUpperCase() === Role.OWNER) {
      userRole = Role.OWNER;
      break;
    }
  }

  await addTeamMember(team.id, userId, userRole);
};

const fromDate = (time, date = Date.now()) => {
  return new Date(date + time * 1000);
};
