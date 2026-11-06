#import <AppKit/AppKit.h>

static void *TranstermDockTileIconPreferenceContext = &TranstermDockTileIconPreferenceContext;

@interface TranstermDockTilePlugin : NSObject <NSDockTilePlugIn>
@property(nonatomic, strong) NSDockTile *dockTile;
@property(nonatomic, strong) NSUserDefaults *preferences;
@property(nonatomic) BOOL observesIconPreference;
@end

@implementation TranstermDockTilePlugin

- (void)setDockTile:(NSDockTile *)dockTile {
  if (self.observesIconPreference) {
    [self.preferences removeObserver:self
                          forKeyPath:@"app_icon"
                             context:TranstermDockTileIconPreferenceContext];
    self.observesIconPreference = NO;
  }

  // Assign the backing ivar: the property setter is this protocol callback.
  _dockTile = dockTile;
  if (dockTile == nil) {
    self.preferences = nil;
    return;
  }

  // Observe transterm's domain directly, rather than the Dock helper's shared defaults.
  self.preferences = [[NSUserDefaults alloc] initWithSuiteName:@"com.transterm.desktop"];
  [self.preferences addObserver:self
                     forKeyPath:@"app_icon"
                        options:0
                        context:TranstermDockTileIconPreferenceContext];
  self.observesIconPreference = YES;
  [self refreshDockTile];
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary<NSKeyValueChangeKey, id> *)change
                       context:(void *)context {
  if (context == TranstermDockTileIconPreferenceContext) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self refreshDockTile];
    });
    return;
  }
  [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
}

- (void)refreshDockTile {
  if (self.dockTile == nil) {
    return;
  }

  NSString *variant = [self.preferences stringForKey:@"app_icon"] ?: @"classic";
  NSDictionary<NSString *, NSString *> *iconNames = @{
    @"classic": @"dock-classic",
    @"material": @"dock-material",
    @"clean": @"dock-clean",
  };
  NSString *iconName = iconNames[variant] ?: @"dock-classic";
  NSBundle *pluginBundle = [NSBundle bundleForClass:[self class]];
  NSURL *iconURL = [pluginBundle URLForResource:iconName withExtension:@"png"];
  NSImage *image = iconURL == nil ? nil : [[NSImage alloc] initWithContentsOfURL:iconURL];
  if (image == nil) {
    return;
  }

  NSImageView *imageView = [[NSImageView alloc] initWithFrame:NSMakeRect(0, 0, self.dockTile.size.width, self.dockTile.size.height)];
  imageView.image = image;
  imageView.imageScaling = NSImageScaleProportionallyUpOrDown;
  self.dockTile.contentView = imageView;
  [self.dockTile display];
}

- (void)dealloc {
  if (self.observesIconPreference) {
    [self.preferences removeObserver:self
                          forKeyPath:@"app_icon"
                             context:TranstermDockTileIconPreferenceContext];
  }
}

@end
