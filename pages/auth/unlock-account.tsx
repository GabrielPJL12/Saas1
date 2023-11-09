import type { GetServerSidePropsContext } from 'next';
import { useState, type ReactElement, useEffect } from 'react';
import type { ComponentStatus } from 'react-daisyui/dist/types';

import {
  deleteVerificationToken,
  getVerificationToken,
  isVerificationTokenExpired,
} from 'models/verificationToken';
import { unlockAccount } from '@/lib/accountLock';
import { Alert } from '@/components/shared';
import { AuthLayout } from '@/components/layouts';
import { Button } from 'react-daisyui';
import { defaultHeaders } from '@/lib/common';

interface UnlockAccountProps {
  token: string;
  error: string;
  enableRequestNewToken: boolean;
}

interface Message {
  text: string | null;
  status: ComponentStatus | null;
}

const UnlockAccount = ({
  token,
  error,
  enableRequestNewToken,
}: UnlockAccountProps) => {
  const [loading, setLoading] = useState(false);
  const [displayResendLink, setDisplayResendLink] = useState(false);
  const [message, setMessage] = useState<Message>({ text: null, status: null });

  useEffect(() => {
    if (error) {
      setMessage({ text: error, status: 'error' });
    }
  }, [error]);

  useEffect(() => {
    if (enableRequestNewToken) {
      setDisplayResendLink(true);
    }
  }, [enableRequestNewToken]);

  const requestNewLink = async () => {
    try {
      setLoading(true);

      const response = await fetch(`/api/auth/unlock-account`, {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify({ expiredToken: token }),
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error.message);
      }

      setMessage({
        text: 'A new link has been sent to your email address.',
        status: 'success',
      });
    } catch (error: any) {
      setMessage({ text: error.message, status: 'error' });
    } finally {
      setLoading(false);
      setDisplayResendLink(false);
    }
  };

  return (
    <div className="rounded p-6 border">
      {message.text && message.status && (
        <Alert status={message.status}>{message.text}</Alert>
      )}

      {displayResendLink && (
        <Button
          wide
          className="mt-4 btn-outline w-full"
          onClick={requestNewLink}
          loading={loading}
        >
          Request new link
        </Button>
      )}
    </div>
  );
};

UnlockAccount.getLayout = function getLayout(page: ReactElement) {
  return <AuthLayout heading="Unlock your account">{page}</AuthLayout>;
};

export const getServerSideProps = async ({
  query,
}: GetServerSidePropsContext) => {
  const { token } = query as { token: string };

  if (!token) {
    return {
      notFound: true,
    };
  }

  const verificationToken = await getVerificationToken(token);

  if (!verificationToken) {
    return {
      props: {
        error:
          'The link is invalid or has already been used. Please contact support if you need further assistance.',
        enableRequestNewToken: false,
        token,
      },
    };
  }

  if (isVerificationTokenExpired(verificationToken)) {
    return {
      props: {
        error:
          'The link has expired. Please request a new one if you still need to unlock your account.',
        enableRequestNewToken: true,
        token,
      },
    };
  }

  await Promise.allSettled([
    unlockAccount(verificationToken.identifier),
    deleteVerificationToken(verificationToken.token),
  ]);

  return {
    redirect: {
      destination: '/auth/login?success=account-unlocked',
      permanent: false,
    },
  };
};

export default UnlockAccount;
