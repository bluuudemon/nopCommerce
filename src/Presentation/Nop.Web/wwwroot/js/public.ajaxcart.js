/*
** nopCommerce ajax cart implementation
*/


var AjaxCart = {
    loadWaiting: false,
    usepopupnotifications: false,
    topcartselector: '',
    topwishlistselector: '',
    flyoutcartselector: '',
    localized_data: false,

    init: function (usepopupnotifications, topcartselector, topwishlistselector, flyoutcartselector, localized_data) {
        this.loadWaiting = false;
        this.usepopupnotifications = usepopupnotifications;
        this.topcartselector = topcartselector;
        this.topwishlistselector = topwishlistselector;
        this.flyoutcartselector = flyoutcartselector;
        this.localized_data = localized_data;
    },

    setLoadWaiting: function (display) {
        displayAjaxLoading(display);
        this.loadWaiting = display;
  },

    //move a shopping cart item to the custom wishlist
    moveToCustomWishlist: function (urlmove, itemId, wishlistId) {
        if (this.loadWaiting !== false) {
            return;
        }
        this.setLoadWaiting(true);

        var postData = {
          shoppingCartItemId: itemId,
          customWishlistId: wishlistId
        };
        addAntiForgeryToken(postData);

        this.send_ajax(urlmove, postData);
    },

    //create custom wishlist
    createCustomWishlist: function (urlcreate, wishlistName, productId) {
      if (this.loadWaiting !== false) {
        return;
      }
      this.setLoadWaiting(true);

      var postData = {
        name: wishlistName,
        productId: productId
      };
      addAntiForgeryToken(postData);

      this.send_ajax(urlcreate, postData);
    },

    //rename custom wishlist
    renameCustomWishlist: function (urlrename, wishlistName, wishlistId) {
      if (this.loadWaiting !== false) {
        return;
      }
      this.setLoadWaiting(true);

      var postData = {
        wishlistName: wishlistName,
        wishlistId: wishlistId
      };
      addAntiForgeryToken(postData);

      this.send_ajax(urlrename, postData);
    },

    //delete custom wishlist
    deleteCustomWishlist: function (urldelete) {
        if (this.loadWaiting !== false) {
          return;
        }
        this.setLoadWaiting(true);

        var postData = {};
        addAntiForgeryToken(postData);

        this.send_ajax(urldelete, postData);
    },

    //move a product to the custom wishlist from the default wishlist
    moveproducttowishlist: function (urlmove, wishlistid) {
        if (this.loadWaiting !== false) {
            return;
        }
        this.setLoadWaiting(true);
        var postData = {
            wishlistId: wishlistid 
        };
        addAntiForgeryToken(postData);

        this.send_ajax(urlmove, postData);
    },

    //add a product to the cart/wishlist from the catalog pages
    addproducttocart_catalog: function (urladd) {
        if (this.loadWaiting !== false) {
            return;
        }
        this.setLoadWaiting(true);

        var postData = {};
        addAntiForgeryToken(postData);

        this.send_ajax(urladd, postData);
    },

    //add a product to the cart/wishlist from the product details page
    addproducttocart_details: function (urladd, formselector) {
        if (this.loadWaiting !== false) {
            return;
        }
        this.setLoadWaiting(true);

        this.send_ajax(urladd, $(formselector).serialize());
    },

    //add a product to compare list
    addproducttocomparelist: function (urladd) {
        if (this.loadWaiting !== false) {
            return;
        }
        this.setLoadWaiting(true);

        var postData = {};
        addAntiForgeryToken(postData);

        this.send_ajax(urladd, postData);
    },

    send_ajax: function (requestUrl, postData) {
      $.ajax({
        cache: false,
        url: requestUrl,
        type: "POST",
        data: postData,
        success: this.success_process,
        complete: this.resetLoadWaiting,
        error: this.ajaxFailure
      });
    },

    success_process: function (response) {
        if (response.updatetopcartsectionhtml) {
            $(AjaxCart.topcartselector).html(response.updatetopcartsectionhtml);
        }
        if (response.updatetopwishlistsectionhtml) {
            $(AjaxCart.topwishlistselector).html(response.updatetopwishlistsectionhtml);
        }
        if (response.updateflyoutcartsectionhtml) {
            AjaxCart.replaceFlyoutCart(response.updateflyoutcartsectionhtml);
        }
        if (response.message) {
            //display notification
            if (response.success === true) {
                //success
                if (AjaxCart.usepopupnotifications === true) {
                    displayPopupNotification(response.message, 'success', true);
                }
                else {
                    //specify timeout for success messages
                    displayBarNotification(response.message, 'success', 3500);
                }
            }
            else {
                //error
                if (AjaxCart.usepopupnotifications === true) {
                    displayPopupNotification(response.message, 'error', true);
                }
                else {
                    //no timeout for errors
                    displayBarNotification(response.message, 'error', 0);
                }
            }
            return false;
        }
        if (response.redirect) {
            location.href = response.redirect;
            return true;
        }
        return false;
    },

    resetLoadWaiting: function () {
        AjaxCart.setLoadWaiting(false);
    },

    ajaxFailure: function () {
      alert(AjaxCart.localized_data.AjaxCartFailure);
    },

    cartUpdating: false,

    readProgressWidth: function ($root) {
        var fill = $root.find('.free-shipping-progress__fill:visible').get(0) || $root.find('.free-shipping-progress__fill').get(0);
        if (!fill)
            return '';
        return fill.getAttribute('data-progress') || fill.style.width || '';
    },

    replaceFlyoutCart: function (html) {
        var $current = $(this.flyoutcartselector);
        var previous = this.readProgressWidth($current);
        var wasActive = $current.hasClass('active');
        $current.replaceWith(html);
        var $flyout = $(this.flyoutcartselector);
        if (wasActive)
            $flyout.addClass('active');
        this.animateReplacedProgress($flyout, previous);
    },

    animateReplacedProgress: function ($root, previousWidth) {
        if (!previousWidth)
            return;
        $root.find('.free-shipping-progress__fill').each(function () {
            var target = this.getAttribute('data-progress') || this.style.width;
            if (!target || target === previousWidth)
                return;
            this.style.transition = 'none';
            this.style.width = previousWidth;
            void this.offsetWidth;
            this.style.transition = '';
            this.style.width = target;
        });
    },

    replaceFragment: function (doc, selector) {
        var fresh = doc.querySelector(selector);
        var current = document.querySelector(selector);
        if (fresh && current)
            current.replaceWith(document.importNode(fresh, true));
    },

    applyCartResponse: function (html, previousFlyout, wasActive) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var freshSummary = doc.querySelector('.order-summary-content');
        var currentSummary = document.querySelector('.order-summary-content');
        if (!freshSummary || !currentSummary) {
            window.location.reload();
            return;
        }

        var freshQty = doc.querySelector('.header-links .cart-qty');
        var currentQty = document.querySelector(this.topcartselector);
        if (freshQty && currentQty)
            currentQty.innerHTML = freshQty.innerHTML;

        var freshFlyout = doc.querySelector('#flyout-cart');
        var currentFlyout = document.querySelector(this.flyoutcartselector);
        if (freshFlyout && currentFlyout) {
            var importedFlyout = document.importNode(freshFlyout, true);
            currentFlyout.replaceWith(importedFlyout);
            if (wasActive)
                importedFlyout.classList.add('active');
            this.animateReplacedProgress($(importedFlyout), previousFlyout);
        }

        if (!freshSummary.querySelector('#shopping-cart-form')) {
            currentSummary.replaceWith(document.importNode(freshSummary, true));
            return;
        }

        var currentBars = currentSummary.querySelectorAll('.free-shipping-progress');
        var freshBars = freshSummary.querySelectorAll('.free-shipping-progress');
        if (currentBars.length && currentBars.length === freshBars.length) {
            for (var i = 0; i < currentBars.length; i++) {
                var previous = this.readProgressWidth($(currentBars[i]));
                var imported = document.importNode(freshBars[i], true);
                currentBars[i].replaceWith(imported);
                this.animateReplacedProgress($(imported), previous);
            }
        }

        this.replaceFragment(doc, '.order-summary-content table.cart');
        this.replaceFragment(doc, '.order-summary-content .total-info');

        var freshError = freshSummary.querySelector('.message-error');
        var currentError = currentSummary.querySelector('.message-error');
        if (freshError && currentError)
            currentError.replaceWith(document.importNode(freshError, true));
        else if (freshError && !currentError)
            currentSummary.insertBefore(document.importNode(freshError, true), currentSummary.querySelector('#shopping-cart-form'));
        else if (!freshError && currentError)
            currentError.remove();
    },

    updateShoppingCart: function (form, submitter) {
        if (this.cartUpdating)
            return;
        this.cartUpdating = true;
        var self = this;
        var previousFlyout = this.readProgressWidth($(this.flyoutcartselector));
        var wasActive = $(this.flyoutcartselector).hasClass('active');
        var formData = new FormData(form);
        formData.set('updatecart', (submitter && submitter.value) || 'updatecart');
        $.ajax({
            cache: false,
            url: form.getAttribute('action') || window.location.href,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function (html) {
                if (typeof html !== 'string') {
                    window.location.reload();
                    return;
                }
                self.applyCartResponse(html, previousFlyout, wasActive);
            },
            error: function () {
                HTMLFormElement.prototype.submit.call(form);
            },
            complete: function () {
                self.cartUpdating = false;
            }
        });
    }
};

$(document).on('submit', '#shopping-cart-form', function (e) {
    var submitter = e.originalEvent && e.originalEvent.submitter;
    if (!submitter || submitter.name !== 'updatecart')
        return;
    e.preventDefault();
    AjaxCart.updateShoppingCart(this, submitter);
});