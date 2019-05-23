# Invite Everyone

```JS
PartyBrowserAPI.ActionJoinParty = function() {};
LobbyAPI.CloseSession = function() {};
LobbyAPI.KickPlayer = function() {};

var partyCount = PartyBrowserAPI.GetResultsCount();
for (var partyIndex = 0; partyIndex < partyCount; partyIndex++) {
	var partyXuid = PartyBrowserAPI.GetXuidByIndex(partyIndex);
	var memberCount = PartyBrowserAPI.GetPartyMembersCount(partyXuid);
	for (var memberIndex = 0; memberIndex < memberCount; memberIndex++) {
		var memberXuid = PartyBrowserAPI.GetPartyMemberXuid(partyXuid, memberIndex);
		FriendsListAPI.ActionInviteFriend(memberXuid.toString(), "");
	}
}

var friendCount = FriendsListAPI.GetCount();
for (var friendIndex = 0; friendIndex < friendCount; friendIndex++) {
	var friendXuid = FriendsListAPI.GetXuidByIndex(friendIndex);
	FriendsListAPI.ActionInviteFriend(friendXuid, "");
}
```

# Invite Nearby

```JS
PartyBrowserAPI.ActionJoinParty = function() {};
LobbyAPI.CloseSession = function() {};
LobbyAPI.KickPlayer = function() {};

var partyCount = PartyBrowserAPI.GetResultsCount();
for (var partyIndex = 0; partyIndex < partyCount; partyIndex++) {
	var partyXuid = PartyBrowserAPI.GetXuidByIndex(partyIndex);
	var memberCount = PartyBrowserAPI.GetPartyMembersCount(partyXuid);
	for (var memberIndex = 0; memberIndex < memberCount; memberIndex++) {
		var memberXuid = PartyBrowserAPI.GetPartyMemberXuid(partyXuid, memberIndex);
		FriendsListAPI.ActionInviteFriend(memberXuid.toString(), "");
	}
}
```

# Fake VAC Ban

```JS
UiToolkitAPI.ShowGenericPopupOkBgStyle('Disconnected', 'VAC banned from secure server.', '', function() {}, 'dim');
MyPersonaAPI.IsVacBanned = function() { return 1 };
CompetitiveMatchAPI.ActionReconnectToOngoingMatch = function() {};
PartyBrowserAPI.ActionJoinParty = function() {};
LobbyAPI.CloseSession = function() {};
LobbyAPI.KickPlayer = function() {};
LobbyAPI.UpdateSessionSettings = function() {};
FriendsListAPI.GetCount = function() { return 0 };
GameInterfaceAPI.ConsoleCommand = function() {};
UiToolkitAPI.ShowCustomLayoutPopupParameters = function() {};
CompetitiveMatchAPI.ActionReconnectToOngoingMatch = function() {};
```
