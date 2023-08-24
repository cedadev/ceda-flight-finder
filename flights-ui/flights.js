/*jslint browser: true, devel: true, sloppy: true*/
/*global google, $, GeoJSON*/

// ---------------------------------- Utils -----------------------------------
function formatDate(dt){
    // Function for splitting date from ES-style format to human readable time/date
    var time, date;
    var df, dfor;
    time = dt.split('T')[1];
    date = dt.split('T')[0];

    df = date.split('-');
    dfor = df[2] + '/' + df[1] + '/' + df[0];

    return time + ' ' + dfor;
}

function formatDates(start, end, content){
    // Function for formatting start- and end-times into human-readable version for display
    var times, df, dfor;
    if (start.split('T')[0] == end.split('T')[0]){
        // Same date
        times = start.split('T')[1] + ' - ' + end.split('T')[1];
        df = start.split('T')[0].split('-');
        dfor = df[2] + '/' + df[1] + '/' + df[0]; 

        content += '<p><strong>Flight Time: </strong>' +
                    times + '</p>' +
                    '<p><strong>Date: </strong>' +
                    dfor + '</p>';
    }
    else {
        // Write as start and end times
        content += '<p><strong>Start Time: </strong>' +
                   formatDate(start) + '</p>' +
                   '<p><strong>End Time: </strong>' +
                   formatDate(end) + '</p>';
    }
    return content;
}

// Currently Unused Util
function getParameterByName(name) {
    // Function from: http://stackoverflow.com/a/901144
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)'),
        results = regex.exec(location.search);
    if (!results) {
        return null;
    }
    return decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Window constants
const ES_HOST = 'https://elasticsearch.ceda.ac.uk/'
var INDEX = "stac-flightfinder-items"; //getParameterByName('index') || 'eufar';
var ES_URL = ES_HOST + INDEX + '/_search';
var TRACK_COLOURS = [
    '#4D4D4D', '#5DA5DA', '#FAA43A',
    '#60BD68', '#F17CB0', '#B2912F',
    '#B276B2', '#DECF3F', '#F15854'
];

var FPOP = 500;

// -------------------------- String Hash For Colors --------------------------
String.prototype.hashCode = function () {
    // Please see: http://bit.ly/1dSyf18 for original
    var i, c, hash;

    hash = 0;
    if (this.length === 0) {
        return hash;
    }

    for (i = 0; i < this.length; i += 1) {
        c = this.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
    }

    return hash;
};

// Currently Unused String function
String.prototype.truncatePath = function (levels) {
    // Removes 'levels' directories from a path, e.g.:
    // '/usr/bin/path/to/something/useful'.truncatePath(3);
    //     => '/usr/bin/path
    var parts, t_path;
    parts = this.split('/');
    t_path = parts.slice(0, parts.length - levels).join('/');
    return t_path;
};

// -------------------------- 'Export Results' Modal --------------------------
function updateExportResultsModal(hits) {
    $('#results').html(JSON.stringify(hits, null, '    '));
}

// -------------------------------ElasticSearch--------------------------------

function datelineCheck(lng1,lng2){
    // If we constrain the first entry to be the western lng point and the second the eastern lng point, then we know if
    // two search areas are required by checking if the west lng is greater than the east lng.
    return (lng1 > lng2)
}

// Currently Unused ShapeQuery Formation Function
function geoShapeRequest(envelope, capswitch) {
    // Abstraction function to build the geo_shape query
    var shape = {
        "type": "envelope",
        "coordinates": envelope
    };
    if (capswitch){
        var gsearch = {"shape":shape,"relation": "within"};
    } else {
        var gsearch = {"shape": shape};
    };

    var gsq = {
        "geo_shape": {
            "geometry.search": gsearch
        }
    }
    return gsq;
}

function getTimeRequest(){
    // Function for assembling temporal request
    var start_time, end_time;
    var def_start, def_end;
    var range;

    start_time = $('#start_time').val();
    end_time = $('#end_time').val();

    def_start = '1985-01-01';
    def_end = '2022-11-24';

    if (start_time == ''){
        if (end_time == ''){
            range = '';
        }
        else {
            range = {
                "properties.start_datetime":{
                    "from":def_start,
                    "to":end_time
                }
            };
        }
    } else {
        if (end_time == ''){
            range = {
                "properties.start_datetime":{
                    "from":start_time,
                    "to":def_time
                }
            }
        }
        else {
            range = {
                "properties.start_datetime":{
                    "from":start_time,
                    "to":end_time
                }
            }
        }
    }
    return range;

}

function createElasticsearchRequest(gmaps_corners, fpop, drawing) {
    // Function for assembling all components of elasticsearch request
    
    var i, tmp_ne, tmp_sw, nw, se, request, tf, vars;

    if (drawing) {
        nw = gmaps_corners[0];
        se = gmaps_corners[1];
        // First check to see if the search window crosses the date line
        var envelope_corners = []
        if (datelineCheck(nw[0], se[0])) {
            // We have crossed the date line, need to send the search area into two.
            envelope_corners.push([nw, [180, se[1]]])
            envelope_corners.push([[-180, nw[1]], se])

        } else {
            // Not crossing the date line so can just use the search area.
            envelope_corners.push([nw, se])
        }
        capswitch = requestFromCapswitch();
    }
    /*
    else {
        tmp_ne = gmaps_corners.getNorthEast();
        tmp_sw = gmaps_corners.getSouthWest();
        nw = [tmp_sw.lng(), tmp_ne.lat()];
        se = [tmp_ne.lng(), tmp_sw.lat()];
    } */

    // ElasticSearch request
    request = {
        '_source': {
            'include': [
                'es_id',
                'description_path',
                'collection',
                'geometry.display',
                'properties',
            ]
        },
        'query': {
            'bool': {
                'filter': {
                    'bool': {
                        'must': [
                            {
                                "exists": {
                                    "field": "geometry.display.type"
                                }
                            },
                        ],
                        'must_not': [],
                        'should':[]
                    }
                }
            }
        },
        'aggs' : {
            'variables': {
                "terms":{
                    "field":"properties.variables.keyword"
                }
            },
            'instruments': {
                "terms":{
                    "field":"properties.instruments.keyword",
                    "size":10
                }
            },
            'collections':{
                "terms":{
                    "field":"collection.keyword"
                }
            },
        },
        'size': fpop,
        'sort':[{
            'properties.start_datetime':{
                'order':'desc'
            }
        }]

    };
    var is_push = true;
    // Push the geoshape conditions to the main request.
    if (is_push){
        if (drawing){
            for (i = 0; i < envelope_corners.length; i++) {
                request.query.bool.filter.bool.must.push(geoShapeRequest(envelope_corners[i], capswitch));
            }
        }
    // Add other filters from page to query
        var search_str = "";
        var ivar, insts, colls, tf;

        // Keyword Push
        tf = requestFromKeyword();
        if (tf) {
            for (i = 0; i < tf.length; i += 1) {
                if (search_str.length > 0){
                    search_str = search_str.concat(" AND ", tf[i]);
                }
                else{
                    search_str = tf[i];
                }
            }
        }
        // Vars Push
        vars = requestFromMultiselect('#var_multiselect');
        if (vars) {
            for (ivar of vars) {
                if (search_str.length > 0){
                    search_str = search_str.concat(" AND ", ivar);
                }
                else{
                    search_str = ivar;
                }
            }
        }
        // Instruments Push
        insts = requestFromMultiselect('#inst_multiselect');
        if (insts) {
            for (inst of insts) {
                if (search_str.length > 0){
                    search_str = search_str.concat(" AND ", inst);
                }
                else{
                    search_str = inst;
                }
            }
        }
        // Collections Push
        coll = requestFromButtons();
        if (coll) {
            if (search_str.length > 0){
                search_str = search_str.concat(" AND ", coll);
            }
            else{
                search_str = coll;
            }
        }
        // Push All Strings
        if (search_str.length > 0){
            var query_str = {
                "query_string":
                {
                    "query": search_str
                }
            };
            request.query.bool.filter.bool.must.push(query_str);
        }

        // Flight Number Filter
        fnums = requestFromFlightNum();
        // fnums is an array of flight numbers
        if (fnums){
            request.query.bool.filter.bool.must.push(
                { 
                    "term":
                    {
                        "properties.flight_num": fnums,
                    }
            });
        }

        range = getTimeRequest();
        if (range){
            request.query.bool.filter.bool.must.push({range});
        }
        console.log(request);
    }
    return request;
}

function requestData(request, callback, gmap, fulldraw){
    // Simple test function to switch to test data
    sendElasticsearchRequest(request, callback, gmap, fulldraw);
    //getTestJson(callback, gmap);
}

function getTestJson(callback, gmap){
    // Retrieve test json data - outdated 24/11/2022
    $.getJSON("jsons/test1.json", function(json){
        callback(json,gmap, false)
    });
}

function sendElasticsearchRequest(request, callback, gmap, fulldraw) {
    // Function for constructing XHR XML Request and handling HttpResponse from ES Cluster
    var xhr, response;
    xhr = new XMLHttpRequest();
    xhr.open('POST', ES_URL, true);
    xhr.setRequestHeader("Content-Type", "application/json")
    var request_str = JSON.stringify(request)
    xhr.send(request_str);
    xhr.onload = function () {
        if (xhr.readyState === 4) {
            response = JSON.parse(xhr.responseText);

            if (gmap) {
                callback(response, gmap, fulldraw);
            } else {
                callback(response, fulldraw);
            }
        }
    };
}

function updateMap(response, gmap, fulldraw) {
    // Function for updating map and UI interface after response is received
    if (response.hits) {
        // Update "hits" and "response time" fields
        $('#resptime').html(response.took);
        $('#numresults').html(response.hits.hits.length);

        // Draw flight tracks on a map
        drawFlightTracks(gmap, response.hits.hits);
        var temp = geometries;
    }

    if (response.aggregations) {
        // Generate variable aggregation on map and display
        if (response.aggregations.variables){
            displayAggregatedVariables(
                response.aggregations.variables.buckets,
                '#var_multiselect');
        }
        if (response.aggregations.instruments){
            displayAggregatedVariables(
                response.aggregations.instruments.buckets,
                '#inst_multiselect');
        }
        
        if (response.aggregations.collections && fulldraw){
            displayAggregatedVariablesAsButtons(
                response.aggregations.collections.buckets,'coll_select', gmap);
        }
    }
}

function updateRawJSON(response) {
    // Pipe Function - no real use
    updateExportResultsModal(response.hits.hits);
}

function updateFilePaths(response) {
    var h, i, paths;
    h = response.hits.hits;

    paths = [];
    for (i = 0; i < h.length; i += 1) {
        paths.push(h[i]._source.file.path);
    }

    updateExportResultsModal(paths);
}

function updateDownloadPaths(response) {
    var h, i, paths;
    h = response.hits.hits;

    paths = [];
    for (i = 0; i < h.length; i += 1) {
        paths.push('http://data.ceda.ac.uk' + h[i]._source.file.path);
    }

    updateExportResultsModal(paths);
}


// ---------------------------------- Map -------------------------------------
var geometries = [];
var info_windows = [];

function centreMap(gmap, geocoder, loc) {
    if (loc !== '') {
        geocoder.geocode(
            {
                address: loc
            },
            function (results, status) {
                if (status === 'OK') {
                    gmap.panTo(results[0].geometry.location);
                } else {
                    alert('Could not find "' + loc + '"');
                }
            }
        );
    }
}

function createInfoWindow(hit) {
    var content, info, index;

    hit = hit._source;

    content = "<section>"
    
    if (hit.properties.flight_num) {
        content += '<p><strong>Flight Number: </strong>' +
                    hit.properties.flight_num 
        content += ' (' + hit.collection.toUpperCase() + ')' + '</p>';
    } else if (hit.properties.pcode) {
        // Probably an arsf flight
        content += '<p><strong>Project Code: </strong>' +
                    hit.properties.pcode[0] +
                    ' (' + hit.collection.toUpperCase() + ')' + '</p>';
    }

    if (hit.properties.aircraft){
        content += '<p><strong>Aircraft: </strong>' +
                    hit.properties.aircraft;
        if (hit.properties.platform) {
            content += ' (' + hit.properties.platform + ')';
        }
        content += '</p>';
    } 

    // Reset content
    content = formatDates(hit.properties.start_datetime, hit.properties.end_datetime, content);

    // crew, altitude
    if (hit.properties.instruments){
        if (hit.properties.instruments[0]){
            var i, inst_count, buff;
            content += '<p><strong>Instrument(s): </strong>' + hit.properties.instruments[0];

            if (hit.properties.instruments.length < 3){
                inst_count = hit.properties.instruments.length;
                buff = '';
            }
            else{
                inst_count = 3;
                buff = '...';
            }

            for (i = 1; i < inst_count; i += 1) {
                content += ', ' + hit.properties.instruments[i];
            }

            content += buff + '</p>';
        }
    }

    if (hit.properties.variables){
        var i;
        if (hit.properties.variables.length > 1 || hit.properties.variables[0] != ""){
            content += '<p><strong>Variables: </strong>' + hit.properties.variables[0];
            for (i = 1; i < hit.properties.variables.length; i += 1) {
                content += ',' + hit.properties.variables[i];
            }
            content += '</p>';
        }
    }

    if (hit.properties.location){
        // location is item or array
        var i;
        if (typeof hit.properties.location == 'string'){
            content += '<p><strong>Location: </strong>' + hit.properties.location ;
        } else {
            content += '<p><strong>Locations: </strong>' + hit.properties.location[0];
            for (i = 1; i < hit.properties.location.length; i += 1) {
                content += ',' + hit.properties.location[i];
            }
        }
        if (hit.properties.altitude){
            content += ' (' + hit.properties.altitude + ')';
        }
        content += '</p>';

    }

    // Add crew here

    var href_start = "window.open('http://data.ceda.ac.uk";
    var href_end = "','_blank')"

    content += '<button onclick=' + href_start +
               hit.description_path + href_end + ">View Flight Data in CEDA Archive</button>";    

    content += '</section>';
    info = new google.maps.InfoWindow(
        {
            content: content,
            disableAutoPan: false
        }
    );

    return info;
}

function drawFlightTracks(gmap, hits) {
    var colour_index, geom, hit, i, info_window, options, display, gs;
    var count_lines = 0;
    var limit = hits.length;

    for (hit of hits) {

        colour_index = (hit._id.hashCode() % TRACK_COLOURS.length);
        if (colour_index < 0) {
            colour_index = -colour_index;
        }

        options = {
            strokeColor: TRACK_COLOURS[colour_index],
            strokeWeight: 5,
            strokeOpacity: 0.6
        };

        // Create GeoJSON object - deal with MultiLineString
        display = hit._source.geometry.display;
        geoms = GeoJSON(display, options);
        count_lines++;
        for (geom of geoms){
            geom.setMap(gmap);
            count_lines++;
        }
        
        geometries.push(geoms);

        // Construct info windo
        info_window = createInfoWindow(hit);
        info_windows.push(info_window);
    }
    $('#numlines').html(count_lines);
    
    for (i = 0; i < geometries.length; i += 1) {
        var geoms = geometries[i];
        for (line of geoms){
            google.maps.event.addListener(line, 'click',
                (function (i, e) {
                    return function (e) {

                        google.maps.event.clearListeners(gmap, 'idle');

                        for (info_window of info_windows) {
                            info_window.close();
                        }

                        info_windows[i].setPosition(e.latLng);
                        info_windows[i].open(gmap, null);

                        window.setTimeout(function () {
                            addBoundsChangedListener(gmap);
                        }, 500);
                    };
                }
            )(i));
        }
    }
}

function cleanup() {

    for (var i=0; i<geometries.length; i++) {
        for (var j=0; j<geometries[i].length; j++){
            geometries[i][j].setMap(null);
        }
    }
    geometries = [];

    for (i = 0; i < info_windows.length; i += 1) {
        info_windows[i].close();
    }
    info_windows = [];
}

function redrawMap(gmap, add_listener, fulldraw) {
    var full_text, request;

    cleanup();

    // Draw flight tracks
    var fpop = requestFromFlightPop()
    if (!fpop){
        fpop = FPOP;
    }
    if (parseInt(fpop) > 1000){
        fpop = 1000;
    }
    request = createElasticsearchRequest(null, fpop, false);
    requestData(request, updateMap, gmap, fulldraw);

    if (add_listener === true) {
        window.setTimeout(function () {
            addBoundsChangedListener(gmap);
        }, 500);
    }
}

function addBoundsChangedListener(gmap) {
    google.maps.event.addListenerOnce(gmap, 'idle', function () {
        if (window.rectangle === undefined)
            redrawMap(gmap, true, false);
    });
}

// -------------------------------- Histogram ---------------------------------
function drawHistogram(map, request) {
    var ost, buckets, keys, counts, i;

    ost = request.aggregations.only_sensible_timestamps;
    buckets = ost.docs_over_time.buckets;
    keys = [];
    counts = [];
    for (i = 0; i < buckets.length; i += 1) {
        keys.push(buckets[i].key_as_string);
        counts.push(buckets[i].doc_count);
    }

    $('#date_histogram').highcharts({
        chart: {
            type: 'column',
            height: 200,
            width: document.getElementById('filter').offsetWidth * 0.75,
        },
        title: {
            text: ''
        },
        xAxis: {
            categories: keys,
            labels: {
                step: 6,
                rotation: 270,
                useHTML: true
            }
        },
        yAxis: {
            title: {
                text: null
            },
            type: 'logarithmic'
        },
        legend: {
            enabled: false
        },
        plotOptions: {
            column: {
                borderWidth: 0,
                groupPadding: 0,
                pointPadding: 0,
                cursor: 'pointer',
                point: {
                    events: {
                        click: function(){
                            // Refine time window here - and only refresh hist if category not already monthly
                            var date = this.category;
                            if (date.length < 5){
                                sendHistogramRequest(map, date);
                                $('#start_time').val(date + '-01-01' );
                                $('#end_time').val(date + '-12-31');
                                redrawMap(map, false, false);
                            } else {
                                // Don't update histogram but do update map
                                // Reset time picker values
                                var date_arr = date.split('-');
                                $('#start_time').val(date_arr[1] + '-' + date_arr[0] + '-01');
                                $('#end_time').val(date_arr[1] + '-' + date_arr[0] + '-31');
                                redrawMap(map, false, false);
                            }
                        }
                    }
                }
            }
        },
        series: [{
            name: 'Number of flights',
            data: counts
        }]
    });
}

function sendHistogramRequest(map, timespecifier) {
    var req, response, xhr;
    var range, interval, format;

    if (timespecifier == 'all'){
        range = {'range':{
            'properties.start_datetime': {
                'gt': '1985-01-01'
            }}
        };
        format = 'yyyy';
        interval = 'year';
    }
    else {
        range = {'range':{
            'properties.start_datetime': {
                'gt': timespecifier+'-01-01',
                'lt': timespecifier+'-12-31'
            }}
        };
        format = 'MM-yyyy';
        interval = 'month';
    }
    req = {
        'aggs': {
            'only_sensible_timestamps': {
                'filter': range,
                'aggs': {
                    'docs_over_time': {
                        'date_histogram': {
                            'field': 'properties.start_datetime',
                            'format': format,
                            'interval': interval,
                            'min_doc_count': 0
                        }
                    }
                }
            }
        },
        'size': 0
    };
    xhr = new XMLHttpRequest();
    xhr.open('POST', ES_URL, true);
    xhr.setRequestHeader("Content-Type", "application/json")
    xhr.send(JSON.stringify(req));
    xhr.onload = function (e) {
        if (xhr.readyState === 4) {
            response = JSON.parse(xhr.responseText);
            drawHistogram(map, response);
        }
    };
}

// ----------------------------- window.onload --------------------------------
window.onload = function () {
    var geocoder, lat, lon;

    // Google Maps geocoder and map object
    geocoder = new google.maps.Geocoder();
    map = new google.maps.Map(
        document.getElementById('map'),
        {
            mapTypeId: google.maps.MapTypeId.TERRAIN,
            zoom: 4
        }
    );

    centreMap(map, geocoder, 'Lake Balaton, Hungary');
    google.maps.event.addListener(map, 'mousemove', function (event) {
        // Add listener to update mouse position
        // see: http://bit.ly/1zAfter
        lat = event.latLng.lat().toFixed(4);
        lon = event.latLng.lng().toFixed(4);
		$('#mouse').html(lat + ', ' + lon);
	});

    //------------------------------- Text Input -------------------------------
    $('#fnumtext').keypress(
        function (e) {
            var charcode = e.charCode || e.keyCode || e.which;
            if (charcode === 13) {
                if (window.rectangle !== undefined) {
                    queryRect(map);
                } else {
                    redrawMap(map, false, false);
                }
            }
        }
    );

    $('#location').keypress(
        function (e) {
            var charcode = e.charCode || e.keyCode || e.which;
            if (charcode === 13) {
                centreMap(map, geocoder, $('#location').val());
                return false;
            }
        }
    );

    $('#fpoptext').keypress(
        function (e) {
            var charcode = e.charCode || e.keyCode || e.which;
            if (charcode === 13) {
                if (window.rectangle !== undefined) {
                    queryRect(map);
                } else {
                    redrawMap(map, false, false);
                }
            }
        }
    );

    $('#kwtext').keypress(
        function (e) {
            var charcode = e.charCode || e.keyCode || e.which;
            if (charcode === 13) {
                if (window.rectangle !== undefined) {
                    queryRect(map);
                } else {
                    redrawMap(map, false, false);
                }
            }
        }
    );

    $('#applyfil').click(
        function() {
            if (window.rectangle !== undefined) {
                queryRect(map);
            } else {
                redrawMap(map, false, false);
            }
        }
    );

    $('#clearfil').click(
        function () {
            $('#start_time').val('');
            $('#end_time').val('');
            $('#fpoptext').val('');
            $('#fnumtext').val('');
            $('#kwtext').val('');
            if (window.rectangle !== undefined) {
                clearRect();
            }
            clearAggregatedVariables();
            clearAggregatedVariablesAsButtons();
            redrawMap(map, false, true);
            sendHistogramRequest(map, 'all');
            // Make sure the rectangle drawing tool is deactivated.
            $('#polygon_draw').prop('checked', false).change()
        }
    );

    //--------------------------- 'Export Results' ---------------------------
    $('#raw_json').click(
        function () {
            var req;
            req = createElasticsearchRequest(null, FPOP, false);
            requestData(req, updateRawJSON, false);
        }
    );

    $('#file_paths').click(
        function () {
            var req;
            requestData(req, updateFilePaths, false);
            req = createElasticsearchRequest(null, FPOP, false);
        }
    );

    $('#dl_urls').click(
        function () {
            var req;
            requestData(req, updateDownloadPaths, false);
            req = createElasticsearchRequest(null, FPOP, false);
        }
    );

    $('#export_modal_close').click(
        function () {
            updateExportResultsModal(null);
        }
    );

    //----------------------------- UI Widgets -------------------------------
    $('#var_multiselect').multiSelect(
        {
            afterSelect: function () {
                redrawMap(map, false, false);
            },
            afterDeselect: function () {
                redrawMap(map, false, false);
            }
        }
    );

    $('#inst_multiselect').multiSelect(
        {
            afterSelect: function () {
                redrawMap(map, false, false);
            },
            afterDeselect: function () {
                redrawMap(map, false, false);
            }
        }
    );

    // Kick off help text popovers
    // http://stackoverflow.com/a/18537617
    $('[data-toggle="popover"]').popover({
        'trigger': 'hover',
        'placement': 'top'
    });

    // Datepicker
    picker = $('#datepicker').datepicker({
        autoclose: true,
        format: 'yyyy-mm-dd',
        startView: 2
    });

    // Draw histogram
    sendHistogramRequest(map, 'all');

    // Add rectangle toggle listener
    $('#polygon_draw').change(function(){
        rectToolToggle(map)
    })

    $('#capswitch').change(function(){
        if (window.rectangle !== undefined) {
            queryRect(map);
        } else {
            redrawMap(map, false, false);
        }
    })

    // 'Include photography' checkbox
    $('#photography_checkbox').change(function () {
        redrawMap(map, false, false);
    });

    //---------------------------- Map main loop ------------------------------

     google.maps.event.addListenerOnce(map, 'tilesloaded', function() {
         redrawMap(map, true, true)
      })
};
