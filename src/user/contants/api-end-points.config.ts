export const imexApiEndPoints = {
    urlSubAccount: 'https://t.imcustody.tech',
    urlAuthSubAccount: 'https://auth-t.imcustody.tech',
    idngoApiEndPoints: {
        getTokenIdentification: '/resources/accessTokens?userId={userId}&levelName={levelName}',
        createNewAncet: '/resources/applicants?levelName={levelName}',
    },
    imexApiEndPoints: {
        userIdentification: '/api/ms-broker-identity/v1/verification/generate_access_token',
        getStatusChecking: '/api/ms-broker-identity/v1/verification/check_liveness_state',
        getToken: '/realms/imex/protocol/openid-connect/token',
    }

}
