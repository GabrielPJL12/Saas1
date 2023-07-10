import { ApiError } from '@/lib/errors';
import { getSession } from '@/lib/session';
import { createApiKey, fetchApiKeys } from 'models/apiKey';
import { getTeam, hasTeamAccess } from 'models/team';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { method } = req;

  try {
    switch (method) {
      case 'GET':
        await handleGET(req, res);
        break;
      case 'POST':
        await handlePOST(req, res);
        break;
      default:
        res.setHeader('Allow', 'GET, POST');
        res.status(405).json({
          error: { message: `Method ${method} Not Allowed` },
        });
    }
  } catch (error: any) {
    const message = error.message || 'Something went wrong';
    const status = error.status || 500;

    res.status(status).json({ error: { message } });
  }
}

// Get API keys
const handleGET = async (req: NextApiRequest, res: NextApiResponse) => {
  const session = await getSession(req, res);

  if (!session) {
    throw new ApiError(401, 'Unauthorized.');
  }

  const { slug } = req.query as { slug: string };

  if (!(await hasTeamAccess({ userId: session.user.id, teamSlug: slug }))) {
    throw new ApiError(403, 'You are not allowed to perform this action');
  }

  const team = await getTeam({ slug });
  const apiKeys = await fetchApiKeys(team.id);

  res.json({ data: apiKeys });
};

// Create an API key
const handlePOST = async (req: NextApiRequest, res: NextApiResponse) => {
  const session = await getSession(req, res);

  if (!session) {
    throw new ApiError(401, 'Unauthorized.');
  }

  const { slug } = req.query as { slug: string };
  const { name } = JSON.parse(req.body) as { name: string };

  if (!(await hasTeamAccess({ userId: session.user.id, teamSlug: slug }))) {
    throw new ApiError(403, 'You are not allowed to perform this action');
  }

  const team = await getTeam({ slug });
  const apiKey = await createApiKey({
    name,
    teamId: team.id,
  });

  res.status(201).json({ data: { apiKey } });
};
