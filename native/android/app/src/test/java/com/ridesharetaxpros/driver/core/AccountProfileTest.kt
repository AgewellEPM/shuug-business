package com.ridesharetaxpros.driver.core

import com.ridesharetaxpros.driver.data.*
import org.junit.Assert.*
import org.junit.Test

class AccountProfileTest {
    private val account=ClientAccount("client-a","Old name","client@example.com")
    private val branding=WorkspaceBrand("Tax team","#A627F6","#F70CE8")
    private val connection=Connection("https://workspace.example.com",LoginReply(1,"a".repeat(64),"2026-11-09T12:00:00Z",account,branding))
    @Test fun displayNameUpdatePreservesSessionAndScopeIdentity() {
        val result=AccountProfileReply(1,account.copy(name="New name"),branding.copy(name="Updated team")).applyTo(connection)
        assertEquals("New name",result.session.account.name)
        assertEquals(connection.session.account.id,result.session.account.id)
        assertEquals(connection.session.token,result.session.token)
        assertEquals(connection.session.expiresAt,result.session.expiresAt)
        assertEquals(connection.origin,result.origin)
    }
    @Test fun anotherClientOrUnknownApiCannotReplaceProfile() {
        assertTrue(runCatching {AccountProfileReply(1,account.copy(id="client-b"),branding).applyTo(connection)}.isFailure)
        assertTrue(runCatching {AccountProfileReply(2,account,branding).applyTo(connection)}.isFailure)
        assertEquals("Old name",connection.session.account.name)
    }
    @Test fun sameAccountReauthRenewsOnlyTheExpectedClientSession() {
        val fresh=connection.session.copy(token="b".repeat(64),expiresAt="2026-12-01T12:00:00Z",account=account.copy(email="CLIENT@example.com"))
        val renewed=sameAccountReauthentication(connection,fresh)
        assertEquals(fresh,renewed.session);assertEquals(connection.origin,renewed.origin)
        assertTrue(runCatching {sameAccountReauthentication(connection,fresh.copy(account=account.copy(id="client-b")))}.isFailure)
        assertTrue(runCatching {sameAccountReauthentication(connection,fresh.copy(account=account.copy(email="other@example.com")))}.isFailure)
        assertTrue(runCatching {sameAccountReauthentication(connection,fresh.copy(token="invalid"))}.isFailure)
    }
    @Test fun displayNamesTrimAndRejectControlCharacters() {
        assertEquals("Luke Kist",validatedDisplayName("  Luke Kist  "))
        for(value in listOf(" ","A\nB","A\u007fB","A".repeat(101))) assertTrue(runCatching {validatedDisplayName(value)}.isFailure)
    }
}
