//The required modules
const http = require('http');
const fs = require('fs');
const url = require('url');
const https = require('https');
const querystring = require('querystring');
const readline = require('readline');

const hostname = '127.0.0.1';
const port = 3000;

/*This is where the spotify credintials are stored. I first read the file and then JSON parse it to be able to use 
the different parts of the data. 
*/
const credentials_json = fs.readFileSync('./auth/credentials.json', 'utf-8');
const credentials = JSON.parse(credentials_json);

//These are the option parameters that are converted to querystring to send through post request body.
const post_data = {
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    grant_type: "client_credentials"
};

//QSTRING is the queried string that is sent in the body of the post request. 
const qstring = querystring.stringify(post_data);

//Post method options. 
const options = {
    method: 'POST',
    'headers': {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': qstring.length
    }
};

//Function to create the cache to store the authentication tokens. 
function create_cache(authentication_res_data) {
    authentication_res_data = JSON.stringify(authentication_res_data);
    fs.writeFileSync('./auth/authentication_res.json', authentication_res_data);
}



//If authentication cache already exists it will be stored in this variable. 
const authentication_cache = './auth/authentication_res.json';

//Function to request image search. Taking in spotify artists objects and the response 
function create_image_req(search_res_data, res) {

    console.log("Requesting image from Spotify");
    //URL parsing the link that is provided for the image to obtain the correct path to store the image in. 
    let img_url = url.parse(search_res_data.artists.items[0].images[0].url);
    //The path that the image will be saved and cached into:
    let img_path = "./artists" + img_url.path.substring(img_url.path.lastIndexOf("/"), img_url.path.length) + ".jpg";

    //The request to get the image from spotify api, provide the image url where we are requesting the image from
    let image_req = https.get(search_res_data.artists.items[0].images[0].url, image_res => {
        //new_img creates a write stream for the image and writes to the image path. 
        let new_img = fs.createWriteStream(img_path, {
            'encoding': null
        });
        let artistName = search_res_data.artists.items[0].name;
        let artistGenre = search_res_data.artists.items[0].genres.join();
        image_res.pipe(new_img);

        //When image is finished downloading serves the webpage with relevant information. 
        new_img.on('finish', function() {
            let webpage = `<h1>${artistName}</h1> <p>${artistGenre}</p><img src= "${img_path}"/>`;
            res.write(webpage);
            res.end();
        });
    });
    image_req.on('error', function(err) {
        console.log(err);
    });
}

//This function is called when we don't have artis in cache and need to reach out to Spotify API to get artist token. 
function search_req(search_req_url, res) {
    console.log("Requesting artist tokens from Spotify");
    let search_req = https.request(search_req_url, search_res => {
        let body = "";
        search_res.on("data", data => {
            body += data
        });
        search_res.on("end", () => {
            search_res_data = JSON.parse(body);

            //These variables are used to store newArtist that are not cached already
            let img_url = url.parse(search_res_data.artists.items[0].images[0].url);
            let img_path = "./artists" + img_url.path.substring(img_url.path.lastIndexOf("/"), img_url.path.length) + ".jpg";
            let artistName = search_res_data.artists.items[0].name;
            let artistGenre = search_res_data.artists.items[0].genres.join();

            const newArtist = {
                Name: artistName,
                Genre: artistGenre,
                Url: img_path
            };

            var data = fs.readFileSync('./artistInfo/artists.json');
            var json = JSON.parse(data);

            json.push(newArtist);
            fs.writeFileSync('./artistInfo/artists.json', JSON.stringify(json));

            create_image_req(search_res_data, res);
        });
    });

    search_req.on('error', (e) => {
        console.error(e);
    });
    search_req.write("");
    search_req.end();
}

//Creates search request and determines if a sear request has to be made to the api. 
function create_search_req(authentication_res_data, res, user_input, request_sent_time) {
    //Spotify require that a search get request is provided with the artist name, type:artist, and access token. 
    let get_data = {
        q: user_input.artist,
        type: 'artist',
        access_token: authentication_res_data.access_token
    };
    //Query string of the parameters
    let get_data_qstring = querystring.stringify(get_data);
    //This is url that is provided in the search request which includes the required querystrings. 
    let search_req_url = 'https://api.spotify.com/v1/search?' + get_data_qstring;

    //If artists file already exists, read into the file and then check if the artist we are looking for is stored inside. 
    if (fs.existsSync('./artistInfo/artists.json')) {
        //Reading into the file
        var data = fs.readFileSync('./artistInfo/artists.json');
        var json = JSON.parse(data);

        //These variable are used to determine if the artist is already cached. 
        var artistExist = false;
        var aname = '';
        var agenre = '';
        var aurl = '';

        //This for loop checks to see if artist name matches with any artist name already in cache. If it does 
        //then artistExist is set to true and the variables are set to the object that matches. 
        for (var i = 0, length = json.length; i < length; i++) {
            if (json[i].Name.toLowerCase() == user_input.artist.toLowerCase()) {
                aname = json[i].Name;
                agenre = json[i].Genre;
                aurl = json[i].Url;
                artistExist = true;
            }
        }
        //If the artist exists in caches serve the page to the user, no need to ask spotify for artist objects.
        if (artistExist) {
            console.log("Retrieving artist info from CACHE");
            let webpage = `<h1>${aname}</h1> <p>${agenre}</p><img src= "${aurl}"/>`;
            res.write(webpage);
            res.end();
        //If the artist does not exist then we need to create a search request and get the artist object from spotify API. 
        } else {
            //Call searh req where we get spotify artist object and then store it in cache. 
            search_req(search_req_url, res);
        }
        //This code is run the first time when artists.json does not exist, does not run again. 
    } else {
        let search_req = https.request(search_req_url, search_res => {
            let body = "";
            search_res.on("data", data => {
                body += data
            });
            search_res.on("end", () => {
                search_res_data = JSON.parse(body);

                //These variables are used to store newArtist that are not cached already
                let img_url = url.parse(search_res_data.artists.items[0].images[0].url);
                let img_path = "./artists" + img_url.path.substring(img_url.path.lastIndexOf("/"), img_url.path.length) + ".jpg";
                let artistName = search_res_data.artists.items[0].name;
                let artistGenre = search_res_data.artists.items[0].genres.join();

                //Array where we will be caching artist objects. 
                var artists = [];
                const newArtist = {
                    Name: artistName,
                    Genre: artistGenre,
                    Url: img_path
                };

                artists.push(newArtist);
                fs.writeFileSync('./artistInfo/artists.json', JSON.stringify(artists));

                create_image_req(search_res_data, res);
            });
        });

        search_req.on('error', (e) => {
            console.error(e);
        });
        search_req.write("");
        search_req.end();
    }
}


//This function is used to extend the expiration of the spotify access token and and store it in cache and then call the search request. 
function recieved_authentication(authentication_res, res, user_input, request_sent_time) {
    authentication_res.setEncoding("utf8");
    let body = "";
    authentication_res.on("data", data => {
        body += data
    });
    authentication_res.on("end", () => {
        let authentication_res_data = JSON.parse(body);
        //Shows the access token information onto console
        console.log(authentication_res_data);

        //Extends the expiration of the token.
        authentication_res_data.expiration = (new Date(request_sent_time.getTime() + (1 * 60 * 60 * 1000))).toJSON();
        //Creates cache of the access-token
        create_cache(authentication_res_data);
        create_search_req(authentication_res_data, res, user_input, request_sent_time);
    });
}

const server = http.createServer((req, res) => {

    if (req.url === '/') {
        console.log('Request was made: ' + req.url);
        res.writeHead(200, {
            'content-type': 'text/html'
        });
        var stream = fs.createReadStream('./html/search-form.html');
        stream.pipe(res);
        res.end;
    } else if (req.url.includes('/favicon.ico')) {
        res.writeHead(404);
        res.end();
    } else if (req.url.includes('/artists/')) {
        console.log('Request was made: ' + req.url);
        res.writeHead(200, {
            'content-type': 'image/jpeg'
        });
        var image_stream = fs.createReadStream("." + req.url);
        image_stream.on('error', function(err) {
            console.log(err);
            res.writeHead(404);
            return res.end();
        });
        image_stream.pipe(res);
        res.end;
    } else if (req.url.includes('/search')) {
        console.log('Request was made: ' + req.url);
        res.writeHead(200, {
            'content-type': 'text/html'
        });
        var data = url.parse(req.url, true).query;
        var user_input = new Object();
        user_input.artist = data.artist;

        //Access Token
        let cache_valid = false;
        //If authentication already exists then check if its expired
        if (fs.existsSync(authentication_cache)) {
            content = fs.readFileSync(authentication_cache, 'utf-8');
            cached_auth = JSON.parse(content);
            if (new Date(cached_auth.expiration) > Date.now()) {
                cache_valid = true;
            } else {
                console.log('Token Expired');
            }
        }
        //If token not expired continue with search
        if (cache_valid) {
            create_search_req(cached_auth, res, user_input);
        } else {
            //Get new authentication
            const authentication_req_url = 'https://accounts.spotify.com/api/token';
            let request_sent_time = new Date();
            let authentication_req = https.request(authentication_req_url, options, authentication_res => {
                recieved_authentication(authentication_res, res, user_input, request_sent_time);
            });

            authentication_req.on('error', (e) => {
                console.error(e);
            });
            authentication_req.write(qstring);
            console.log("Requesting Token");
            authentication_req.end();
        }
        //Access Token
        res.end;
    }
    res.end;
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});