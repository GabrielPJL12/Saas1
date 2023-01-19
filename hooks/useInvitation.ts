import useSWR from "swr";

import fetcher from "@/lib/fetcher";
import { ApiResponse } from "types";
import { Invitation, Team } from "@prisma/client";

const useInvitation = (token: string) => {
  const url = `/api/invitations/${token}`;

  const { data, error, isLoading } = useSWR<
    ApiResponse<Invitation & { team: Team }>
  >(token ? url : null, fetcher);

  return {
    isLoading,
    isError: error,
    invitation: data?.data,
  };
};

export default useInvitation;
