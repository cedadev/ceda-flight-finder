/*jslint browser: true, devel: true, sloppy: true*/
/*global google, $, GeoJSON*/

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
var REQUEST_SIZE = 1000;
var INDEX = getParameterByName('index') || 'ceda-eo';
var ES_URL = 'http://jasmin-es1.ceda.ac.uk:9000/' + INDEX + '/_search';
var TRACK_COLOURS = [
    '#B276B2', '#5DA5DA', '#FAA43A',
    '#60BD68', '#F17CB0', '#B2912F',
    '#4D4D4D', '#DECF3F', '#F15854'
];
var redraw_pause = false;

// based on the Track Colours
var COLOUR_MAP = {
    "sentinel1" : "#B276B2",
    "sentinel2" : "#5DA5DA",
    "sentinel3" : "#FAA43A",
    "landsat"   : "#60BD68",
    "other"     : "#F17CB0"
};
var export_modal_open = false;

// -----------------------------------String-----------------------------------
String.prototype.hashCode = function () {
    // Please see: http://bit.ly/1dSyf18 for original
    var i, c, hash;

    hash = 0;
    if (this.length === 0) {
        return hash;
    }

    for (i = 0; i < this.length; i++) {
        c = this.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
    }

    return hash;
};

String.prototype.truncatePath = function (levels) {
    // Removes 'levels' directories from a path, e.g.:
    // '/usr/bin/path/to/something/useful'.truncatePath(3);
    //     => '/usr/bin/path
    var parts, t_path;
    parts = this.split('/');
    t_path = parts.slice(0, parts.length - levels).join('/');
    return t_path;
};


// ---------------------------'Export Results' Modal---------------------------
    function sleep(miliseconds) {
        var currentTime = new Date().getTime();

        while (currentTime + miliseconds >= new Date().getTime()) {
        }
    }

    function updateExportResultsModal(hits) {
        loading();
        $('#results').html(JSON.stringify(hits, null, '    '));
    }

    $('#copy').click( function (event) {
        $('#results').select();

        try {
            var successful = document.execCommand('copy');
        } catch (err) {
            console.log('Oops, unable to copy');
        }
    });

    // Handle popover trigger and release
    $('#copy[data-toggle="popover"]')
        .on('focus', function(event) {
            $(this).popover({
                placement:'bottom',
                trigger:'manual'
            });
            $(this).popover('show');
    })
        .on('blur', function(event) {
            sleep(700);
            $(this).popover('hide');
    });


// ---------------------------'Loading' Modal---------------------------

    function displayLoadingModal() {
        var $loading = $('#loading_modal');
        $loading.css("display", $loading.css("display") === 'none' ? 'block' : 'none');

    }

    // loading gif inside export modal
    function loading(){
            var loading_blk = $('.loading_block');
            loading_blk.css("display", loading_blk.css("display") === 'none' ? 'block' : 'none');
        }

// ---------------------------'Quicklook' Modal---------------------------

function displayquicklookModal(i) {
    // set quicklook image
    $('#modal-quicklook-image').attr('src', quicklooks[i]);

    // set modal title to data filename
    var title = $(info_windows[i].getContent()).find("#iw-title").first().html();
    title = title.replace(/^<strong>.+<\/strong>/g,'');
    $('#file_nameQL').html(title);

    var $loading = $('#quicklook_modal');
    $loading.modal()

}

//Display the unavailable.png image in place of the broken image icon.
$('#quicklook_modal').on('hidden.bs.modal', function () {
    $('#modal-quicklook-image').attr('onerror', 'imgError(this)')

});
// -------------------------------ElasticSearch--------------------------------
function requestFromFilters(full_text) {
    var i, ft, req;

    req = [];
    if (full_text.length > 0) {
        ft = full_text.split(' ');
        for (i = 0; i < ft.length; i += 1) {
            req.push({
                term: {
                    _all: ft[i].toLowerCase()

                }
            });
        }
        return req;
    }
}

// -------------------------------Hierarchy tree ------------------------------

    function titleCase(string){
        return string.charAt(0).toUpperCase() + string.slice(1);
    }


    function getDocCount(key, aggregatedData) {
        var count;
        var data_count = aggregatedData['data_count']['buckets'];
        var i;

        for (i=0; i< data_count.length; i++){
            if (data_count[i]['key'] === key ){
                count = data_count[i]['doc_count']
                break;
            }
            count = 0
        }
        if (!data_count.length){ count = 0}
        return count
    };

    function getTreeJSON(aggregatedData, numbers) {
        if (numbers === undefined){ numbers=true}
        var tree = [];
        var tree_buckets = aggregatedData['all'];
        var satellites, childName, child, doc_count, child_JSON, satellite_node

        // Create JSON for satellites aggregation
        if ("satellites" in tree_buckets) {
            satellites = tree_buckets['satellites']['buckets'];

            // Create the child JSON
            var i, j, satellite_children = [];
            for (i = 0, j = satellites.length; i < j; i++) {
                child = satellites[i]['key'];
                doc_count = getDocCount(child,aggregatedData);
                if (numbers){
                    childName = child + ' <span class="badge text-left">'+ doc_count +'</span>';
                } else {
                    childName = child;
                }

                child_JSON = {
                    text: titleCase(childName)
                    };

                // push each child to the children array
                satellite_children.push(child_JSON)
            }

            // Create the main satellite parent node
                satellite_node = {
                    text: "Satellites",
                    nodes: satellite_children,
                    selectable: false
            };

            // Push the satellite node JSON to the main tree data array.
            tree.push(satellite_node)
        }
        return tree
    }

    function initTree(response) {
        var aggregatedData = response.aggregations;
        var treeMenu = $('#tree_menu');

        treeMenu.treeview({
            data: getTreeJSON(aggregatedData, false),
            showCheckbox: true,
            multiSelect: true,
            highlightSelected: false,
            showBorder: false,
            onNodeChecked: function (event, data) {
                treeMenu.treeview('selectNode', [data.nodeId])
            }
        });
        treeMenu.treeview('checkAll');
    }

    function childSelectToggle(method, children, gmap){
        var tree_menu = $('#tree_menu'), child, i;

        // Don't trigger redrawMap() until the last child is toggled
        redraw_pause = true;

        for (i=0; i<children.length; i++){
            // if(i === children.length -1){redraw_pause=false}
            child = children[i];
            tree_menu.treeview(method,[child])
        }
        if (window.rectangle !== undefined){
            queryRect()
        } else {
            redrawMap(gmap, true)
        }
        redraw_pause = false;
    }

    function siblingState(node){
        // tests state of all sibling nodes. Returns true 
        var tree = $('#tree_menu');
        var siblings = tree.treeview('getSiblings',[node]);
        var test= [tree.treeview('getNode',[node]).state.checked];
        var i, sibling;
        for (i=0; i < siblings.length; i++){
            sibling = siblings[i];
            test.push(sibling.state.checked)
        }
        return test.every(function (element, index, array) { return element === true })
    }

    function updateTreeDisplay(aggregatedData, gmap) {

        var tree_menu = $('#tree_menu');

        // get current state before the tree is updated.
        var selection = tree_menu.treeview('getSelected');

        tree_menu.treeview({
            data: getTreeJSON(aggregatedData),
            showCheckbox: true,
            showBorder: false,
            multiSelect: true,
            highlightSelected: false,
            onNodeSelected: function (event, data) {
                tree_menu.treeview('checkNode', [data.nodeId, {silent:true}]);
                if (!redraw_pause){
                    if(window.rectangle !== undefined){
                        queryRect(gmap)
                    } else {
                        redrawMap(gmap, true)
                    }
                }

                if(siblingState(data.nodeId)){
                    tree_menu.treeview('checkNode',[0, {silent: true}]);
                    tree_menu.treeview('selectNode',[0, {silent: true}]);
                } else{
                   tree_menu.treeview('uncheckNode',[0, {silent: true}]);
                   tree_menu.treeview('unselectNode',[0, {silent: true}]);
                }

            },
            onNodeUnselected: function (event, data) {
                tree_menu.treeview('uncheckNode', [data.nodeId, {silent:true}]);
                if (!redraw_pause){
                    if (window.rectangle !== undefined){
                        queryRect(gmap)
                    } else {
                        redrawMap(gmap, true)}
                }

                if(siblingState(data.nodeId)){
                    tree_menu.treeview('checkNode',[0, {silent: true}]);
                    tree_menu.treeview('selectNode',[0, {silent: true}]);
                } else{
                   tree_menu.treeview('uncheckNode',[0, {silent: true}]);
                   tree_menu.treeview('unselectNode',[0, {silent: true}]);
                }

            },
            onNodeChecked: function (event, data) {
                if (data.text !== "Satellites"){
                    tree_menu.treeview('selectNode', [data.nodeId]);

                    if (!redraw_pause){redrawMap(gmap, true)}

                } else{
                    tree_menu.treeview('selectNode', [data.nodeId, {silent:true}]);
                    var children = data.nodes;
                    childSelectToggle('checkNode',children, gmap)
                }
            },
            onNodeUnchecked: function (event,data) {
                if (data.text !== "Satellites"){
                    tree_menu.treeview('unselectNode', [data.nodeId]);
                    if (!redraw_pause){
                        redrawMap(gmap, true)}

                } else{
                    tree_menu.treeview('unselectNode', [data.nodeId,{silent:true}]);
                    var children = data.nodes;
                    childSelectToggle('uncheckNode',children, gmap)
                }
            }
        });

        // apply previous state if there were checked boxes.
        if (selection.length){
            for (i = 0; i < selection.length; i++){
                var node = selection[i];
                tree_menu.treeview('checkNode',[node.nodeId, {silent: true}]);
                tree_menu.treeview('selectNode',[node.nodeId, {silent: true}]);
            }
        }
    }

    function requestFromTree() {
        // Get the checked items in the tree to apply in the ES query.
        var i, req=[], selection;

        selection = $('#tree_menu').treeview('getUnselected');
        if (selection.length){
            for (i=0; i < selection.length; i++){
                if (selection[i].text !== "Satellites"){
                    req.push({
                        match: {
                            'misc.platform.Satellite.raw' : selection[i].text.split(' ')[0]

                        }
                    });
                }
            }

            return req;
        }
        return '';
    }

// -------------------------------ElasticSearch--------------------------------
    function requestFromFilters(full_text) {
        var i, ft, req;

        req = [];
        if (full_text.length > 0) {
            ft = full_text.split(' ');
            for (i = 0; i < ft.length; i += 1) {
                req.push({
                    term: {
                        _all: ft[i].toLowerCase()
                    }
                });
            }
            return req;
        }
    }

    function esRequest(nw,se,size){
        return {
            "_source": {
                "include": [
                    "data_format.format",
                    "file.filename",
                    "file.path",
                    "file.data_file",
                    "file.quicklook_file",
                    "file.location",
                    "misc",
                    "spatial",
                    "temporal"
                ]
            },
            "query": {
                "filtered": {
                    "query": {
                        "match_all": {}
                    },
                    "filter": {
                        "bool": {
                            "must": [
                                {
                                    "geo_shape": {
                                        "spatial.geometries.search": {
                                            "shape": {
                                                "type": "envelope",
                                                "coordinates": [nw, se]
                                            }
                                        }
                                    }
                                }
                            ],
                            "must_not": [
                                {
                                    "missing": {
                                        "field": "spatial.geometries.display.type"
                                    }

                                }
                            ]
                        }
                    }
                }
            },
            "aggs": {
                "data_count": {
                    "terms": {
                        "field": "misc.platform.Satellite.raw"
                    }
                },
                "all": {
                    "global": {},
                    "aggs": {
                        "satellites": {
                            "terms": {
                                "field": "misc.platform.Satellite.raw",
                                "size": 30
                            }
                        }
                    }
                }
            },
            "size": size
        };
    }

    function createElasticsearchRequest(gmaps_corners, full_text, size, drawing) {
        var i, end_time, tmp_ne, tmp_sw, no_photography, nw,
            se, start_time, request, temporal, tf, vars;

         // Present loading modal
        if (!export_modal_open){ displayLoadingModal()}

        if (drawing) {
            nw = gmaps_corners[0];
            se = gmaps_corners[1]
        }
        else{

            tmp_ne = gmaps_corners.getNorthEast();
            tmp_sw = gmaps_corners.getSouthWest();
            nw = [tmp_sw.lng().toString(), tmp_ne.lat().toString()];
            se = [tmp_ne.lng().toString(), tmp_sw.lat().toString()];
        }


        // ElasticSearch request
        request = esRequest(nw, se, size);

        // Add other filters from page to query
        tf = requestFromFilters(full_text);
        if (tf) {
            for (i = 0; i < tf.length; i += 1) {
                request.query.filtered.filter.bool.must.push(tf[i]);
            }
        }

        // Tree selection filters.
        vars = requestFromTree();

        if (vars){
            for (i = 0; i < vars.length; i += 1) {
                request.query.filtered.filter.bool.must_not.push(vars[i]);
            }
        }

        temporal = {
            range: {
                'temporal.start_time': {}
            }
        };

        start_time = $('#start_time').val();
        if (start_time !== '') {
            temporal.range['temporal.start_time'].from = start_time;
        }

        end_time = $('#end_time').val();
        if (end_time !== '') {
            temporal.range['temporal.start_time'].to = end_time;
        }

        if (temporal.range['temporal.start_time'].to !== null ||
                temporal.range['temporal.start_time'].from !== null) {
            request.query.filtered.filter.bool.must.push(temporal);
        }

        return request;
    }

    function sendElasticsearchRequest(request, callback, gmap) {
        var xhr, response;

        // Construct and send XMLHttpRequest
        xhr = new XMLHttpRequest();
        xhr.open('POST', ES_URL, true);
        xhr.send(JSON.stringify(request));
        xhr.onload = function () {
            if (xhr.readyState === 4) {
                response = JSON.parse(xhr.responseText);

                if (gmap) {
                    callback(response, gmap);
                } else {
                    callback(response);
                }
            }
        };
    }

// -------------------------- Update Map features and Export Modal Parameters ------------------------------------------

    function updateMap(response, gmap) {
        if (response.hits) {
            // Update "hits" and "response time" fields
            $('#resptime').html(response.took);
            $('#numresults').html(response.hits.total);

            // Draw flight tracks on a map
            drawFlightTracks(gmap, response.hits.hits);

            // Toggle loading modal
            if (!export_modal_open){
                displayLoadingModal()
            }
        }
        if (response.aggregations) {
            // Generate variable aggregation on map and display
            updateTreeDisplay(response.aggregations, gmap);
        }
    }

    function updateRawJSON(response) {
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


// -----------------------------------Map--------------------------------------
var geometries = [];
var info_windows = [];
var quicklooks = [];

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

    // --------------------------- Info window ------------------------------------


    function createInfoWindow(hit) {
        var content, info;

        hit = hit._source;

        view = {
            filename: hit.file.data_file,
            start_time: hit.temporal.start_time,
            end_time: hit.temporal.end_time,
            mission: hit.misc.platform.Mission,
            satellite: hit.misc.platform.Satellite,
            instrument: hit.misc.platform["Instrument Abbreviation"]
        };

        var template = $('#infowindowTemplate').html();
        content = Mustache.render(template, view);

        if (hit.file.quicklook_file) {
            quicklooks.push('http://data.ceda.ac.uk' + hit.file.path.truncatePath(1)+ '/' + hit.file.quicklook_file)
        }
        else {
            quicklooks.push('-')
        }

        if (hit.file.location === "on_disk") {
            content += '<p><a target="_blank" href="http://data.ceda.ac.uk' +
                hit.file.path.truncatePath(1) + '/' + hit.file.data_file + '">Get this data file</a></p>';

            content += '<p><a target="_blank" href="http://data.ceda.ac.uk' +
                hit.file.path.truncatePath(1) + '">View directory for this scene</a></p>';
        } else {
            content += '<p>This file is stored on tape, please click <a target="_blank" href="http://help.ceda.ac.uk/article/265-nla">here</a> for information about access to this file.</p>'
        }

        // close the section tag
        content += '</section>';

        info = new google.maps.InfoWindow(
            {
                content: content,
                disableAutoPan: false
            }
        );

        return info;
    }

        // ------------------------------ Info window quicklook -------------
        function getQuickLook(info_window, i) {
            var content = $(info_window.getContent());

            if (quicklooks[i] !== '-') {

                var quicklook = "<img class='quicklook' src='" + quicklooks[i] + "' alt='Data quicklook image' onclick='displayquicklookModal(" + i + ")' onerror='imgError(this)'> ";
                content.find("#quicklooks_placeholder").first().html(quicklook);
                content = content.prop('outerHTML');

                info_window.setContent(content)
            }
        }
        // replace the broken img icon with a custom image.
        function imgError(image) {
            image.onerror = "";
            image.src = "./img/unavailable.png"
        }

function colourSelect(mission){
    var colour;
    switch (true){
        case /sentinel\W1.*/gi.test(mission):
            colour = COLOUR_MAP['sentinel1'];
            break;

        case /sentinel\W2.*/gi.test(mission):
            colour = COLOUR_MAP['sentinel2'];
            break;

        case /sentinel\W3.*/gi.test(mission):
            colour = COLOUR_MAP['sentinel3'];
            break;

        case /landsat/gi.test(mission):
            colour = COLOUR_MAP['landsat'];
            break;

        default:
            colour = COLOUR_MAP['other'];
            break;
    }
    return colour
}

function drawFlightTracks(gmap, hits) {
    var colour_index, geom, hit, i, info_window, options, display;
    // Clear old map drawings
    cleanup()

    for (i = 0; i < hits.length; i += 1) {
        hit = hits[i];

        var mission = hit._source.misc.platform.Mission
        options = {
            strokeColor: colourSelect(mission),
            strokeWeight: 5,
            strokeOpacity: 0.6,
            fillOpactiy: 0.1
        };
        // Create GeoJSON object
        display = hit._source.spatial.geometries.display;
        geom = GeoJSON(display, options);

        geom.setMap(gmap);
        geometries.push(geom);

        // Construct info window
        info_window = createInfoWindow(hit);
        info_windows.push(info_window);
    }

    for (i = 0; i < geometries.length; i += 1) {
        google.maps.event.addListener(geometries[i], 'click',
            (function (i, e, hits) {
                    return function (e, hits) {
                        var j;

                        google.maps.event.clearListeners(gmap, 'bounds_changed');

                        for (j = 0; j < info_windows.length; j += 1) {
                            info_windows[j].close();
                        }

                        info_windows[i].setPosition(e.latLng);
                        getQuickLook(info_windows[i], i);
                        info_windows[i].open(gmap, null);

                        window.setTimeout(function () {
                            addBoundsChangedListener(gmap);
                        }, 1000);
                    };
                })(i));
    }
}


function cleanup() {
    var i;
    for (i = 0; i < geometries.length; i += 1) {
        geometries[i].setMap(null);
    }
    geometries = [];

    for (i = 0; i < info_windows.length; i += 1) {
        info_windows[i].close();
    }
    info_windows = [];
    quicklooks = [];

}

function redrawMap(gmap, add_listener) {
    var full_text, request;

    // Draw flight tracks
    full_text = $('#ftext').val();
    request = createElasticsearchRequest(gmap.getBounds(), full_text, REQUEST_SIZE);
    sendElasticsearchRequest(request, updateMap, gmap);

    if (add_listener === true) {
        window.setTimeout(function () {
            addBoundsChangedListener(gmap);
        }, 1000);
    }
}

function addBoundsChangedListener(gmap) {

    google.maps.event.addListenerOnce(gmap, 'bounds_changed', function () {

        if (window.rectangle === undefined)
        redrawMap(gmap, true);
    });
}


// ---------------------------------Histogram----------------------------------
function drawHistogram(request) {
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
            width: document.getElementById('filter').offsetWidth * 0.75
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
                pointPadding: 0
            },
            series: {
                cursor: 'pointer',
                point: {
                    events: {
                        click: function () {
                            var start_date = this.category + "-01-01";
                            var end_date = this.category + "-12-31";

                            $('#start_time').datepicker('setDate', start_date);
                            $('#end_time').datepicker('setDate',end_date);

                            $('#applyfil').trigger('click')
                        }
                    }
                }

            }
        },
        series: [{
            name: 'Total Datasets',
            data: counts
        }]
    });
}

function sendHistogramRequest() {
    var req, response, xhr;

    req = {
        'aggs': {
            'only_sensible_timestamps': {
                'filter': {
                    'range': {
                        'temporal.start_time': {
                            'gt': '1990-01-01'
                        }
                    }
                },
                'aggs': {
                    'docs_over_time': {
                        'date_histogram': {
                            'field': 'temporal.start_time',
                            'format': 'yyyy',
                            'interval': 'year',
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
    xhr.send(JSON.stringify(req));
    xhr.onload = function (e) {
        if (xhr.readyState === 4) {
            response = JSON.parse(xhr.responseText);
            drawHistogram(response);
        }
    };
}
// Window resize

    $(window).resize(function() {
        sendHistogramRequest()
    })


// ----------------------- Rectangle Drawing tool ---------------------------

    function rectBounds() {
        current_bounds = window.rectangle.getBounds();
        var ne = current_bounds.getNorthEast();
        var sw = current_bounds.getSouthWest();

        return [[sw.lng(),ne.lat()], [ne.lng(),sw.lat()]]
    }

    function queryRect(map) {
        // create ES request, send and draw results.
        var request = createElasticsearchRequest(rectBounds(), $('#ftext').val(), 100, true);
        sendElasticsearchRequest(request, updateMap, map);

        // zoom map to new rectangle
        map.fitBounds(current_bounds);
        map.setZoom(map.getZoom() - 1);
    }

    function clearRect() {
        window.rectangle.setMap(null);
        window.rectangle = undefined;

    }


// ------------------------------window.unload---------------------------------

    // makes sure that the drawing tool is always off on page load.
    $(window).unload($('#polygon_draw').bootstrapToggle('off'));

// ------------------------------window.onload---------------------------------

window.onload = function () {
    var geocoder, lat, lon, map;

    // Google Maps geocoder and map object
    geocoder = new google.maps.Geocoder();
    map = new google.maps.Map(
        document.getElementById('map-container').getElementsByClassName('map')[0],
        {
            mapTypeId: google.maps.MapTypeId.TERRAIN,
            zoom: 3
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

    // set map key colours
    $('#sentinel1Key').css('border-color',COLOUR_MAP['sentinel1']);
    $('#sentinel2Key').css('border-color',COLOUR_MAP['sentinel2']);
    $('#sentinel3Key').css('border-color',COLOUR_MAP['sentinel3']);
    $('#landsatKey').css('border-color',COLOUR_MAP['landsat']);
    $('#otherKey').css('border-color',COLOUR_MAP['other']);


    // Open welcome modal
    // $('#welcome_modal').modal('show')

    //------------------------------- Buttons -------------------------------
    $('#location_search').click(
        function () {
            centreMap(map, geocoder, $('#location').val());
        }
    );

    $('#ftext').keypress(
        function (e) {
            var charcode = e.charCode || e.keyCode || e.which;
            if (charcode === 13) {
                if (window.rectangle !== undefined) {
                    queryRect(map);
                } else {
                    redrawMap(map, false);
                }
                return false;
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

    $('#applyfil').click(
        function () {
            if (window.rectangle !== undefined) {
                queryRect(map);
            } else {
                redrawMap(map, false);
            }
        }
    );

    $('#clearfil').click(
        function () {
            var tree_menu = $('#tree_menu');
            $('#start_time').val('');
            $('#end_time').val('');
            $('#ftext').val('');
            if (window.rectangle !== undefined){
                clearRect();
            }

            if (tree_menu.treeview('getUnselected').length > 0) {
                tree_menu.treeview('checkNode', [0])
            } else {
                redrawMap(map, false);
            }


            $('#polygon_draw').bootstrapToggle('off')

        }
    );


    //---------------------------- Map drawing tool ---------------------------


    $('#polygon_draw').change(
        function () {

            if ($('#polygon_draw').prop('checked')) {

                // Show instructions panel if it is closed.
                $('#collapsePolygonInstructions').collapse('show');

                if (window.rectangle !== undefined) {
                    clearRect();
                }

                // Clear all the satellite product objects to allow user to draw.
                for (i = 0; i < geometries.length; i += 1) {
                    geom = geometries[i];
                    geom.setMap(null)
                }

                map.setOptions({'draggable': false});
                map.setOptions({'keyboardShortcuts': false});

                var dragging = false;
                var rect;

                rect = new google.maps.Rectangle({
                    map: map
                });

                google.maps.event.addListener(map, 'mousedown', function (mEvent) {
                    // Close instruction panel if open
                    $('#collapsePolygonInstructions').collapse('hide');

                    map.draggable = false;
                    latlng1 = mEvent.latLng;
                    dragging = true;
                    pos1 = mEvent.pixel;
                });

                google.maps.event.addListener(map, 'mousemove', function (mEvent) {
                    latlng2 = mEvent.latLng;
                    showRect();
                });

                google.maps.event.addListener(map, 'mouseup', function (mEvent) {
                    map.draggable = true;
                    dragging = false;

                });

                google.maps.event.addListener(rect, 'mouseup', function (data) {
                    map.draggable = true;
                    dragging = false;

                    // Trigger apply filter at the conclusion of the drawing
                    $('#applyfil').trigger('click')

                    // Allow the user to resize and drag the rectangle at the conclusion of drawing.
                    rect.setEditable(true);
                    rect.setDraggable(true);
                });
            }
            else {
                // Hide instructions panel if it is open.
                $('#collapsePolygonInstructions').collapse('hide');

                // clear rectangle drawing listeners and reinstate boundschanged listener.
                google.maps.event.clearListeners(map, 'mousedown');
                google.maps.event.clearListeners(map, 'mouseup');
                addBoundsChangedListener(map)

                dragging = false;
                map.setOptions({draggable: true});
                map.keyboardShortcuts = true;

            }

            function showRect() {
                if (dragging) {
                    if (rect === undefined) {
                        rect = new google.maps.Rectangle({
                            map: map
                        });

                    } else {
                        rect.setEditable(false)
                    }

                    // allow rectangle drawing from any angle, has issues on the international date line.
                    var lat1 = latlng1.lat();
                    var lat2 = latlng2.lat();
                    var minLat = lat1 < lat2 ? lat1 : lat2;
                    var maxLat = lat1 < lat2 ? lat2 : lat1;
                    var lng1 = latlng1.lng();
                    var lng2 = latlng2.lng();
                    var minLng = lng1 < lng2 ? lng1 : lng2;
                    var maxLng = lng1 < lng2 ? lng2 : lng1;
                    var latLngBounds = new google.maps.LatLngBounds(
                        //ne
                        new google.maps.LatLng(maxLat,minLng),
                        //sw
                        new google.maps.LatLng(minLat,maxLng)
                    );
                    rect.setBounds(latLngBounds);

                    window.rectangle = rect
                }
            }
        }
    );



    //--------------------------- 'Export Results' ---------------------------
    $('#raw_json').click(
        function () {
            loading();
            var req;
            if (window.rectangle !== undefined) {
                req = createElasticsearchRequest(rectBounds(), $('#ftext').val(), REQUEST_SIZE, true);

            } else {
                req = createElasticsearchRequest(map.getBounds(), $('#ftext').val(), REQUEST_SIZE);
            }
            sendElasticsearchRequest(req, updateRawJSON);
        }
    );

    $('#file_paths').click(
        function () {
            loading();
            var req;
            if (window.rectangle !== undefined) {
                req = createElasticsearchRequest(rectBounds(), $('#ftext').val(), REQUEST_SIZE, true);

            } else {
                req = createElasticsearchRequest(map.getBounds(), $('#ftext').val(), REQUEST_SIZE);
            }
            sendElasticsearchRequest(req, updateFilePaths);
        }
    );

    $('#dl_urls').click(
        function () {
            loading();
            var req;
            if (window.rectangle !== undefined) {
                req = createElasticsearchRequest(rectBounds(), $('#ftext').val(), REQUEST_SIZE, true);

            } else {
                req = createElasticsearchRequest(map.getBounds(), $('#ftext').val(), REQUEST_SIZE);
            }
            sendElasticsearchRequest(req, updateDownloadPaths);
        }
    );


    // When the modal is dismissed either by the x in corner, close button or by clicking outside; clear previous
    // results and set the export_modal_open variable to false to allow the loading modal to fire.

    var export_modal = $('#export_modal');
    export_modal.on('hidden.bs.modal', function (e) {
        $('#results').html('');
        export_modal_open = false
    });

    // When the modal is displayed, set the export_modal_open variable to supress firing the loading modal.
    export_modal.on('shown.bs.modal', function (e) {
        export_modal_open = true
    });

    //----------------------------- UI Widgets -------------------------------



    // initialise the treeview
    $('#tree_menu').treeview({
        data: {},
        showBorder: false
    });

    // Kick off help text popovers
    // http://stackoverflow.com/a/18537617
    $('span[data-toggle="popover"]').popover({
        'trigger': 'hover'
    });

    // Datepicker
    picker = $('#datepicker').datepicker({
        autoclose: true,
        format: 'yyyy-mm-dd',
        startView: 2
    });



    // Draw histogram
    sendHistogramRequest();

    // Auto-fill temporal filter to select the last year.
    var today = new Date();
    var datestring = (today.getFullYear() -1) + "-" + (today.getMonth() +1) + "-" + today.getDate();

    $('#start_time').datepicker('setDate', datestring);
    $('#end_time').datepicker('setDate',today);


    //---------------------------- Map main loop ------------------------------
    google.maps.event.addListenerOnce(map,'bounds_changed', function () {
        // init Tree
        var bounds, tmp_ne, tmp_sw, nw, se, request;

        bounds = map.getBounds();
        tmp_ne = bounds.getNorthEast();
        tmp_sw = bounds.getSouthWest();
        nw = [tmp_sw.lng().toString(), tmp_ne.lat().toString()];
        se = [tmp_ne.lng().toString(), tmp_sw.lat().toString()];

        request = esRequest(nw,se,0);

        sendElasticsearchRequest(request, initTree, false);
    });

    addBoundsChangedListener(map);
};



