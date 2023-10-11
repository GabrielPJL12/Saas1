import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from 'next';

import * as Yup from 'yup';
import Link from 'next/link';
import { useFormik } from 'formik';
import toast from 'react-hot-toast';
import { Button } from 'react-daisyui';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { type ReactElement, useEffect, useState } from 'react';
import type { ComponentStatus } from 'react-daisyui/dist/types';
import { getCsrfToken, signIn, useSession } from 'next-auth/react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

import env from '@/lib/env';
import type { NextPageWithLayout } from 'types';
import { AuthLayout } from '@/components/layouts';
import GithubButton from '@/components/auth/GithubButton';
import GoogleButton from '@/components/auth/GoogleButton';
import { Alert, InputWithLabel, Loading } from '@/components/shared';
import { authProviderEnabled } from '@/lib/auth';
import Head from 'next/head';

interface Message {
  text: string | null;
  status: ComponentStatus | null;
}

const Login: NextPageWithLayout<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = ({ csrfToken, authProviders }) => {
  const router = useRouter();
  const { status } = useSession();
  const { t } = useTranslation('common');
  const [message, setMessage] = useState<Message>({ text: null, status: null });

  const { error, success, token } = router.query as {
    error: string;
    success: string;
    token: string;
  };

  useEffect(() => {
    if (error) {
      setMessage({ text: error, status: 'error' });
    }

    if (success) {
      setMessage({ text: success, status: 'success' });
    }
  }, [router, router.query]);

  const redirectUrl =  token ? `/invitations/${token}` : env.redirectAfterSignIn;

  const formik = useFormik({
    initialValues: {
      email: '',
      password: '',
    },
    validationSchema: Yup.object().shape({
      email: Yup.string().required().email(),
      password: Yup.string().required(),
    }),
    onSubmit: async (values) => {
      const { email, password } = values;

      const response = await signIn('credentials', {
        email,
        password,
        csrfToken,
        redirect: false,
        callbackUrl: redirectUrl
      });

      formik.resetForm();

      if (!response?.ok) {
        toast.error(t(response?.error));
        return;
      }
    },
  });

  if (status === 'loading') {
    return <Loading />;
  }

  if (status === 'authenticated') {
    router.push(redirectUrl);
  }

  return (
    <>
      <Head>
        <title>{t('login-title')}</title>
      </Head>
      {message.text && message.status && (
        <Alert status={message.status}>{t(message.text)}</Alert>
      )}
      <div className="rounded p-6 border">
        <div className="flex gap-2 flex-wrap">
          {authProviders.github && <GithubButton />}
          {authProviders.google && <GoogleButton />}
        </div>

        {(authProviders.github || authProviders.google) &&
          authProviders.credentials && <div className="divider">or</div>}

        {authProviders.credentials && (
          <form onSubmit={formik.handleSubmit}>
            <div className="space-y-2">
              <InputWithLabel
                type="email"
                label="Email"
                name="email"
                placeholder="Email"
                value={formik.values.email}
                error={formik.touched.email ? formik.errors.email : undefined}
                onChange={formik.handleChange}
              />
              <InputWithLabel
                type="password"
                label="Password"
                name="password"
                placeholder="Password"
                value={formik.values.password}
                error={
                  formik.touched.password ? formik.errors.password : undefined
                }
                onChange={formik.handleChange}
              />
              <p className="text-sm text-gray-600 text-right">
                <Link
                  href="/auth/forgot-password"
                  className="font-medium text-indigo-600 hover:text-indigo-500"
                >
                  {t('forgot-password')}
                </Link>
              </p>
            </div>
            <div className="mt-4">
              <Button
                type="submit"
                color="primary"
                loading={formik.isSubmitting}
                active={formik.dirty}
                fullWidth
                size="md"
              >
                {t('sign-in')}
              </Button>
            </div>
          </form>
        )}

        {(authProviders.email || authProviders.saml) && (
          <div className="divider"></div>
        )}

        <div className="space-y-3">
          {authProviders.email && (
            <Link href="/auth/magic-link" className="btn-outline btn w-full">
              &nbsp;{t('sign-in-with-email')}
            </Link>
          )}

          {authProviders.saml && (
            <Link href="/auth/sso" className="btn-outline btn w-full">
              &nbsp;{t('continue-with-saml-sso')}
            </Link>
          )}
        </div>
      </div>
      <p className="text-center text-sm text-gray-600">
        {t('dont-have-an-account')}
        <Link
          href="/auth/join"
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          &nbsp;{t('create-a-free-account')}
        </Link>
      </p>
    </>
  );
};

Login.getLayout = function getLayout(page: ReactElement) {
  return (
    <AuthLayout heading="Welcome back" description="Log in to your account">
      {page}
    </AuthLayout>
  );
};

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  const { locale }: GetServerSidePropsContext = context;

  return {
    props: {
      ...(locale ? await serverSideTranslations(locale, ['common']) : {}),
      csrfToken: await getCsrfToken(context),
      authProviders: authProviderEnabled(),
    },
  };
};

export default Login;
